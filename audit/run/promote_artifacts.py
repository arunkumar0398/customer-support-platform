#!/usr/bin/env python3
import argparse, hashlib, json, os, re, secrets, stat, sys
MAX_FILES=32
MAX_PER_FILE=8*1024*1024
MAX_TOTAL=20*1024*1024
def _open_root(path):
 if sys.platform != 'linux': raise RuntimeError('artifact promotion requires Linux openat/no-follow semantics')
 return os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
def _validate_name(name):
 if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,127}',name) or name in ('.','..'): raise ValueError('unsafe artifact name')
 return name
def _validate_limits(per_file_limit,total_limit):
 if type(per_file_limit) is not int or type(total_limit) is not int or per_file_limit<1 or total_limit<1 or per_file_limit>MAX_PER_FILE or total_limit>MAX_TOTAL: raise ValueError('requested promotion limits exceed the hard maximum')
def _signature(st): return (st.st_dev,st.st_ino,st.st_mode,st.st_nlink,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
def _read_one(scratch_fd,name,limit,after_open=None):
 flags=os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW|os.O_NONBLOCK
 fd=os.open(name,flags,dir_fd=scratch_fd)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1: raise ValueError('artifact must be a regular single-link file')
  if before.st_size < 0 or before.st_size > limit: raise ValueError('artifact exceeds per-file size limit')
  path_before=os.stat(name,dir_fd=scratch_fd,follow_symlinks=False)
  if _signature(path_before) != _signature(before): raise ValueError('artifact path identity changed before read')
  if after_open is not None: after_open(name)
  chunks=[]; total=0
  while True:
   block=os.read(fd,min(65536,limit+1-total))
   if not block: break
   total += len(block)
   if total > limit: raise ValueError('artifact grew beyond size limit while reading')
   chunks.append(block)
  after=os.fstat(fd); path_after=os.stat(name,dir_fd=scratch_fd,follow_symlinks=False)
  if _signature(after) != _signature(before) or _signature(path_after) != _signature(before) or total != before.st_size:
   raise ValueError('artifact identity or contents changed during read')
  return b''.join(chunks)
 finally: os.close(fd)
def promote_files(scratch,artifacts,run_id,names,per_file_limit=1048576,total_limit=8388608,after_open=None):
 scratch_fd=_open_root(scratch); artifact_fd=_open_root(artifacts)
 try: return _promote_with_fds(scratch_fd,artifact_fd,run_id,names,per_file_limit,total_limit,after_open)
 finally: os.close(scratch_fd); os.close(artifact_fd)
def _promote_with_fds(scratch_fd,artifact_fd,run_id,names,per_file_limit=1048576,total_limit=8388608,after_open=None):
 if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}',run_id) or run_id in ('.','..'): raise ValueError('invalid run id')
 if not isinstance(names,list) or not names or len(names)>MAX_FILES: raise ValueError('invalid artifact allowlist')
 clean=[]
 for name in names:
  clean_name=_validate_name(name)
  if clean_name in clean: raise ValueError('duplicate artifact name')
  clean.append(clean_name)
 if per_file_limit < 1 or total_limit < 1: raise ValueError('invalid size limits')
 stage='.'+run_id+'.tmp-'+secrets.token_hex(8); stage_fd=None
 try:
  os.mkdir(stage,0o700,dir_fd=artifact_fd); stage_fd=os.open(stage,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC|os.O_NOFOLLOW,dir_fd=artifact_fd)
  total=0; hashes={}
  for name in clean:
   data=_read_one(scratch_fd,name,per_file_limit,after_open)
   total += len(data)
   if total > total_limit: raise ValueError('artifact set exceeds cumulative size limit')
   out=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_CLOEXEC|os.O_NOFOLLOW,0o600,dir_fd=stage_fd)
   try:
    view=memoryview(data)
    while view: view=view[os.write(out,view):]
    os.fsync(out)
   finally: os.close(out)
   hashes[name]=hashlib.sha256(data).hexdigest()
  os.fsync(stage_fd)
  try: os.stat(run_id,dir_fd=artifact_fd,follow_symlinks=False)
  except FileNotFoundError: pass
  else: raise FileExistsError('artifact run destination already exists')
  os.rename(stage,run_id,src_dir_fd=artifact_fd,dst_dir_fd=artifact_fd); stage=None; os.fsync(artifact_fd)
  return {'run_id':run_id,'files':clean,'sha256':hashes,'bytes':total}
 finally:
  if stage_fd is not None: os.close(stage_fd)
  if stage is not None:
   try:
    temp_fd=os.open(stage,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC|os.O_NOFOLLOW,dir_fd=artifact_fd)
    try:
     for entry in os.listdir(temp_fd): os.unlink(entry,dir_fd=temp_fd)
     os.rmdir(stage,dir_fd=artifact_fd)
    finally: os.close(temp_fd)
   except FileNotFoundError: pass
def serve(scratch,artifacts):
 scratch_fd=_open_root(scratch); artifact_fd=_open_root(artifacts)
 try:
  print(json.dumps({'ready':True,'platform':sys.platform}),flush=True)
  raw=sys.stdin.readline(65537)
  if not raw or len(raw)>65536: raise ValueError('missing or oversized promotion request')
  request=json.loads(raw)
  if set(request)!={'run_id','files','per_file_limit','total_limit'}: raise ValueError('unexpected promotion request fields')
  _validate_limits(request['per_file_limit'],request['total_limit'])
  result=_promote_with_fds(scratch_fd,artifact_fd,request['run_id'],request['files'],request['per_file_limit'],request['total_limit'])
  print(json.dumps({'promoted':True,**result}),flush=True)
  ack_raw=sys.stdin.readline(65537)
  if not ack_raw or len(ack_raw)>65536: raise ValueError('missing or oversized parent completion acknowledgement')
  ack=json.loads(ack_raw)
  if ack!={'ack':request['run_id']}: raise ValueError('parent completion acknowledgement does not match promoted run')
  print(json.dumps({'complete':True,'run_id':request['run_id']}),flush=True)
 finally:
  os.close(scratch_fd); os.close(artifact_fd)
def main():
 parser=argparse.ArgumentParser(); parser.add_argument('--serve',action='store_true'); parser.add_argument('scratch',nargs='?'); parser.add_argument('artifacts',nargs='?'); args=parser.parse_args()
 if not args.scratch or not args.artifacts: parser.error('scratch and artifacts roots are required')
 if args.serve: serve(args.scratch,args.artifacts)
 else: parser.error('offline promotion is available only in retained-descriptor --serve mode')
if __name__=='__main__':
 try: main()
 except Exception as exc: print('PROMOTION_REFUSED: '+str(exc),file=sys.stderr); raise SystemExit(2)

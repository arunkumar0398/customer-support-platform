#!/usr/bin/env python3
import hashlib, json, os, re, subprocess, sys, tarfile
def fail(message): raise ValueError(message)
def digest_file(path, limit=None):
 h=hashlib.sha256(); total=0
 with open(path,'rb') as stream:
  while True:
   block=stream.read(1024*1024)
   if not block: break
   total+=len(block)
   if limit is not None and total>limit: fail('file exceeds verification bound')
   h.update(block)
 return h.hexdigest(),total
def verify_archive_payload(archive_path,tree_manifest):
 expected={entry['path']:entry for entry in tree_manifest['entries']}
 if len(expected)!=len(tree_manifest['entries']): fail('duplicate Git tree manifest path')
 actual={}
 with tarfile.open(archive_path,'r:') as archive:
  members=archive.getmembers()
  if not members or len(members)>50000: fail('archive member count outside bounds')
  for member in members:
   name=member.name.rstrip('/') if member.isdir() else member.name
   if name.startswith('/') or not name or any(part in ('','.','..') for part in name.split('/')): fail('unsafe path in Git archive')
   if not (member.isdir() or member.isfile()): fail('non-regular archive entry')
   if member.isdir(): continue
   if member.size<0 or member.size>100*1024*1024: fail('archive member exceeds size limit')
   if name in actual: fail('duplicate archive file path')
   actual[name]=member
  if set(actual)!=set(expected): fail('archive file set does not match selected Git tree')
  for name,member in actual.items():
   entry=expected[name]; digest=hashlib.new(tree_manifest['objectFormat'])
   digest.update(('blob '+str(member.size)).encode('ascii')+bytes([0]))
   source=archive.extractfile(member)
   while True:
    block=source.read(1024*1024)
    if not block: break
    digest.update(block)
   if digest.hexdigest()!=entry['oid']: fail('archive blob does not match selected Git object: '+name)
   executable=bool(member.mode & 0o111)
   if executable!=(entry['mode']=='100755'): fail('archive mode differs from selected Git tree: '+name)
 return len(actual)
def validate_execution(execution):
 if execution['platform']!='linux/amd64' or execution['network']!='none' or execution['rootFilesystem']!='read-only' or execution['sourceMount']!='read-only' or execution['toolchainMount']!='read-only' or execution['artifactsMount']!='promoter-only' or execution['dockerSocket']!='parent-launcher-only': fail('unsafe launch configuration record')
 uid=execution.get('uid');gid=execution.get('gid')
 if type(uid) is not int or type(gid) is not int or not (1<=uid<=4294967294) or not (1<=gid<=4294967294): fail('unsafe identity: UID/GID must be valid non-root integers')
 identity=str(uid)+':'+str(gid)
 if (execution['capabilities'],execution['noNewPrivileges'])!=('drop-all',True): fail('unsafe identity or privilege configuration')
 if (execution['cpuLimit'],execution['memoryLimitBytes'],execution['swapLimitBytes'],execution['pidLimit'],execution['fileSizeLimitBytes'],execution['wallClockLimitSeconds'])!=(1,1610612736,0,256,1073741824,5400): fail('unsafe target resource or time limit')
 if execution['scratch']!={'mode':'tmpfs','maxBytes':1153433600}: fail('unsafe scratch configuration')
 allowed={'PATH','HOME','TMPDIR','CI','NODE_ENV','AUDIT_SOURCE_SHA','AUDIT_ARCHIVE_SHA256','AUDIT_TREE_MANIFEST_SHA256','AUDIT_EXPECTED_IMAGE_DIGEST','AUDIT_LOCK_SHA256','AUDIT_SOURCE_LOCK_SHA256','AUDIT_LAUNCH_RECORD_SHA256','DATABASE_URL','DATABASE_URL_UNPOOLED','TEST_DATABASE_URL'}
 if not isinstance(execution.get('environmentAllowlist'),list) or set(execution['environmentAllowlist'])!=allowed: fail('environment allowlist differs from reviewed safe configuration')
 timeout=execution.get('requestedTimeoutSeconds')
 if not isinstance(timeout,int) or timeout<1 or timeout>execution['wallClockLimitSeconds']: fail('requested wall-clock timeout is outside the enforced bound')
 if execution.get('preflightTimeoutSeconds')!=180 or execution.get('promoterStartupTimeoutSeconds')!=60: fail('preflight timeout or promoter startup timeout differs from the reviewed bound')
 if execution.get('promoterLimits')!={'cpu':0.25,'memoryBytes':268435456,'swapBytes':0,'pids':32,'fileSizeLimitBytes':10485760}: fail('unsafe trusted promoter limits')
 target=execution.get('targetArgumentsTemplate'); preflight=execution.get('preflightArguments'); promoter=execution.get('promoterArguments')
 if not isinstance(target,list) or not isinstance(preflight,list) or not isinstance(promoter,list): fail('Docker argument records are missing')
 def require_identity(args,label):
  positions=[index for index,value in enumerate(args) if value=='--user']
  if len(positions)!=1 or positions[0]+1>=len(args) or args[positions[0]+1]!=identity: fail('unsafe identity in '+label+' Docker arguments')
 for args,label in ((target,'target'),(preflight,'preflight'),(promoter,'promoter')): require_identity(args,label)
 target_text='\0'.join(target); preflight_text='\0'.join(preflight); promoter_text='\0'.join(promoter)
 def mount_values(args): return [args[index+1] for index,value in enumerate(args[:-1]) if value=='--mount']
 artifact_volume=execution.get('artifactVolume')
 if not isinstance(artifact_volume,str) or not re.fullmatch(r'csp-artifacts-[0-9a-f]{32}',artifact_volume): fail('unsafe artifact volume identity')
 target_mounts=mount_values(target);preflight_mounts=mount_values(preflight);promoter_mounts=mount_values(promoter)
 if any('type=volume,' in value or artifact_volume in value for value in target_mounts+preflight_mounts): fail('artifact volume must not be mounted in target or preflight')
 volume_mounts=[value for value in promoter_mounts if value.startswith('type=volume,')]
 if volume_mounts!=['type=volume,source='+artifact_volume+',target=/artifacts']: fail('trusted promoter must receive only the selected artifact volume')
 required_target=['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',identity,'--cpus=1','--memory=1536m','--memory-swap=1536m','--pids-limit=256','target=/input,readonly','target=/runner,readonly']
 if any(value not in target_text for value in required_target) or 'target=/artifacts' in target_text or '/var/run/docker.sock' in target_text or '--privileged' in target_text: fail('unsafe or incomplete target Docker arguments')
 tmpfs='/scratch:rw,noexec,nosuid,nodev,size=1153433600,uid='+str(uid)+',gid='+str(gid)+',mode=0700'
 tmpfs_args=[target[index+1] for index,value in enumerate(target[:-1]) if value=='--tmpfs']
 if tmpfs_args != [tmpfs] or 'target=/scratch' in target_text: fail('unsafe target scratch configuration: expected one private bounded tmpfs only')
 required_preflight=['run','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',identity,'--cpus=1','--memory=1536m','--memory-swap=1536m','--pids-limit=256','fsize=1073741824:1073741824','target=/input,readonly','target=/runner,readonly','--entrypoint','/bin/bash','/runner/preflight.sh']
 if any(value not in preflight_text for value in required_preflight) or 'target=/artifacts' in preflight_text or '/var/run/docker.sock' in preflight_text or '--privileged' in preflight_text: fail('unsafe or incomplete preflight Docker arguments')
 preflight_tmpfs=[preflight[index+1] for index,value in enumerate(preflight[:-1]) if value=='--tmpfs']
 if preflight_tmpfs!=[tmpfs]: fail('unsafe preflight scratch configuration')
 required_promoter=['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','target=/runner,readonly','target=/artifacts','target=/scratch,readonly','--pids-limit=32']
 if any(value not in promoter_text for value in required_promoter) or '/var/run/docker.sock' in promoter_text or '--privileged' in promoter_text: fail('unsafe trusted-promoter Docker arguments')
 promotion_input=execution.get('parentPromotionInputDir')
 if not isinstance(promotion_input,str) or not promotion_input or len(promotion_input)>4096 or promotion_input==execution.get('hostInputDir') or promotion_input not in promoter_text or promotion_input in target_text or promotion_input in preflight_text: fail('parent promotion input must be separate and promoter-only')
 expected_volume_options='size=67108864,mode=0700,uid='+str(uid)+',gid='+str(gid)
 if execution.get('artifactVolumeOptions')!=expected_volume_options: fail('unsafe artifact volume ownership')
 required_promoter=['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','target=/runner,readonly','target=/artifacts','target=/scratch,readonly','--pids-limit=32']
 if any(value not in promoter_text for value in required_promoter) or '/var/run/docker.sock' in promoter_text or '--privileged' in promoter_text: fail('unsafe trusted-promoter Docker arguments')

def verify():
 record_path='/input/launch-record.json'; archive_path='/input/source.tar'; tree_path='/input/source-tree-manifest.json'
 record_hash,record_size=digest_file(record_path,1024*1024)
 if record_size>1024*1024 or record_hash!=os.environ.get('AUDIT_LAUNCH_RECORD_SHA256'): fail('launch-record checksum mismatch')
 with open(record_path,encoding='utf-8') as stream: record=json.load(stream)
 source=record['source']; tool=record['toolchain']; trusted=record['trustedCode']; execution=record['execution']
 if source['commit']!=os.environ.get('AUDIT_SOURCE_SHA') or source['archiveCommit']!=source['commit']: fail('source commit claim mismatch')
 if source['archiveSha256']!=os.environ.get('AUDIT_ARCHIVE_SHA256'): fail('archive digest claim mismatch')
 archive_hash,archive_size=digest_file(archive_path,600*1024*1024)
 if archive_hash!=source['archiveSha256'] or archive_size!=source['archiveSize']: fail('archive digest or size mismatch')
 marker=subprocess.run(['git','get-tar-commit-id'],stdin=open(archive_path,'rb'),check=True,text=True,capture_output=True).stdout.strip()
 if marker!=source['commit']: fail('Git archive commit marker mismatch')
 tree_hash,tree_size=digest_file(tree_path,16*1024*1024)
 if tree_size>16*1024*1024 or tree_hash!=source['treeManifestSha256'] or tree_hash!=os.environ.get('AUDIT_TREE_MANIFEST_SHA256'): fail('Git tree manifest digest mismatch')
 with open(tree_path,encoding='utf-8') as stream: tree=json.load(stream)
 if tree.get('commit')!=source['commit'] or tree.get('tree')!=source['tree'] or tree.get('objectFormat')!=source['objectFormat']: fail('Git tree manifest identity mismatch')
 count=verify_archive_payload(archive_path,tree)
 if count!=source['treeEntries']: fail('Git tree manifest entry count mismatch')
 if tool['imageDigest']!=os.environ.get('AUDIT_EXPECTED_IMAGE_DIGEST'): fail('toolchain image digest mismatch')
 if tool['lockfileSha256']!=os.environ.get('AUDIT_LOCK_SHA256'): fail('prepared image lockfile digest mismatch')
 if tool['sourceLockfileSha256']!=os.environ.get('AUDIT_SOURCE_LOCK_SHA256'): fail('selected source lockfile digest mismatch')
 expected={'preflight.sh':trusted['preflightSha256'],'run-offline.sh':trusted['runnerSha256'],'promote_artifacts.py':trusted['promoterSha256'],'verify_input.py':trusted['verifierSha256']}
 for name,want in expected.items():
  actual,_=digest_file('/runner/'+name,16*1024*1024)
  if actual!=want: fail('trusted runner digest mismatch: '+name)
 validate_execution(execution)
 with tarfile.open(archive_path,'r:') as archive:
  members={item.name:item for item in archive.getmembers()}
  def hash_member(name):
   item=members.get(name)
   if item is None or not item.isfile(): fail('required source member missing: '+name)
   source=archive.extractfile(item); digest=hashlib.sha256()
   while True:
    block=source.read(1024*1024)
    if not block: break
    digest.update(block)
   return digest.hexdigest()
  if hash_member('audit/host/launch-offline.mjs')!=trusted['launcherSha256']: fail('committed launcher digest mismatch')
  if hash_member('audit/provision/toolchain-manifest.json')!=tool['manifestSha256']: fail('toolchain manifest archive digest mismatch')
  if hash_member('package-lock.json')!=tool['sourceLockfileSha256']: fail('source package lock archive digest mismatch')
  if hash_member('api/prisma/schema.prisma')!=tool['prismaSchemaSha256']: fail('Prisma schema archive digest mismatch')
  manifest=json.loads(archive.extractfile(members['audit/provision/toolchain-manifest.json']).read())
  if manifest.get('image_id')!=tool['imageDigest'] or manifest.get('target_lockfile_sha256')!=tool['sourceLockfileSha256'] or manifest.get('prepared_image_lockfile_sha256')!=tool['lockfileSha256'] or manifest.get('prisma_schema_sha256')!=tool['prismaSchemaSha256']: fail('manifest values do not match launch record')
 return {'commit':source['commit'],'tree':source['tree'],'treeEntries':count,'archiveSha256':archive_hash,'imageDigest':tool['imageDigest'],'runners':'bound'}
if __name__=='__main__':
 try: print('SOURCE_BINDING_PASS '+json.dumps(verify(),sort_keys=True))
 except Exception as error: print('SOURCE_BINDING_REFUSED: '+str(error),file=sys.stderr); raise SystemExit(2)

import json, os, pathlib, socket, subprocess, sys, tempfile, unittest
from promote_artifacts import promote_files, _validate_limits
class PromotionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.root=pathlib.Path(self.tmp.name); self.scratch=self.root/'scratch'; self.artifacts=self.root/'artifacts'; self.scratch.mkdir(); self.artifacts.mkdir()
 def tearDown(self): self.tmp.cleanup()
 def put(self,name,data=b'ok'):
  p=self.scratch/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(data); return p
 def reject(self,name):
  with self.assertRaises((ValueError,OSError)): promote_files(self.scratch,self.artifacts,'run-test',[name],per_file_limit=64,total_limit=96)
  self.assertFalse((self.artifacts/'run-test').exists())
 def test_rejects_invalid_or_excessive_helper_limits(self):
  for limits in ((0,1),(1,0),(8*1024*1024+1,20*1024*1024),(1,20*1024*1024+1),(True,1)):
   with self.assertRaises(ValueError): _validate_limits(*limits)
  _validate_limits(8*1024*1024,20*1024*1024)
 def test_serve_opens_parent_roots_before_accepting_target_output(self):
  command=[sys.executable,str(pathlib.Path(__file__).with_name('promote_artifacts.py')),'--serve',str(self.scratch),str(self.artifacts)]
  process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  try:
   ready=json.loads(process.stdout.readline()); self.assertEqual(ready,{'ready':True,'platform':'linux'})
   self.put('post-ready.log',b'created after helper opened roots')
   process.stdin.write(json.dumps({'run_id':'run-ready','files':['post-ready.log'],'per_file_limit':128,'total_limit':256})+'\n'); process.stdin.flush()
   result=json.loads(process.stdout.readline()); self.assertTrue(result['promoted'])
   self.assertEqual((self.artifacts/'run-ready'/'post-ready.log').read_bytes(),b'created after helper opened roots')
   process.stdin.write(json.dumps({'ack':'run-ready'})+'\n');process.stdin.close();process.stdin=None
   self.assertEqual(json.loads(process.stdout.readline()),{'complete':True,'run_id':'run-ready'});process.communicate(timeout=5);self.assertEqual(process.returncode,0)
  finally:
   if process.poll() is None: process.kill(); process.wait(timeout=5)
 def test_promotes_only_allowlisted_regular_files(self):
  self.put('api.log',b'bounded'); self.put('ignored.secret',b'secret'); result=promote_files(self.scratch,self.artifacts,'run-test',['api.log'],per_file_limit=64,total_limit=96)
  self.assertEqual((self.artifacts/'run-test'/'api.log').read_bytes(),b'bounded'); self.assertFalse((self.artifacts/'run-test'/'ignored.secret').exists()); self.assertEqual(result['files'],['api.log'])
 def test_rejects_traversal_and_absolute_paths(self):
  self.put('x')
  for name in ('../x','/etc/passwd','a/../../x','','.','a//b'): self.reject(name)
 def test_rejects_symlinks_hardlinks_fifo_and_directories(self):
  self.put('real'); os.symlink(self.scratch/'real',self.scratch/'sym'); os.link(self.scratch/'real',self.scratch/'hard'); os.mkfifo(self.scratch/'fifo'); (self.scratch/'dir').mkdir(); sock=socket.socket(socket.AF_UNIX); sock.bind(str(self.scratch/'socket')); self.addCleanup(sock.close)
  for name in ('sym','hard','fifo','dir','socket'): self.reject(name)
 def test_rejects_oversize_files_and_total(self):
  self.put('large',b'x'*65); self.reject('large'); self.put('a',b'x'*50); self.put('b',b'y'*50)
  with self.assertRaises((ValueError,OSError)): promote_files(self.scratch,self.artifacts,'run-test',['a','b'],per_file_limit=64,total_limit=96)
 def test_refuses_existing_destination_without_overwrite(self):
  self.put('api.log'); dest=self.artifacts/'run-test'; dest.mkdir(); (dest/'keep').write_text('keep')
  with self.assertRaises((ValueError,OSError)): promote_files(self.scratch,self.artifacts,'run-test',['api.log'],per_file_limit=64,total_limit=96)
  self.assertEqual((dest/'keep').read_text(),'keep')
 def test_rejects_changing_file_during_read(self):
  self.put('race',b'x'*32)
  def mutate_same_size_file(name):
   path=self.scratch/name;path.write_bytes(b'y'*32);current=path.stat();os.utime(path,ns=(current.st_atime_ns,current.st_mtime_ns+1000000))
  with self.assertRaises((ValueError,OSError)): promote_files(self.scratch,self.artifacts,'run-test',['race'],per_file_limit=64,total_limit=96,after_open=mutate_same_size_file)
if __name__=='__main__': unittest.main()

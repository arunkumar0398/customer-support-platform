import io, json, os, pathlib, subprocess, tarfile, tempfile, unittest
from verify_input import verify_archive_payload, validate_execution
class ExecutionRecordTests(unittest.TestCase):
 def setUp(self):
  self.execution={'platform':'linux/amd64','network':'none','rootFilesystem':'read-only','sourceMount':'read-only','toolchainMount':'read-only','artifactsMount':'promoter-only','dockerSocket':'parent-launcher-only','uid':10001,'gid':10001,'capabilities':'drop-all','noNewPrivileges':True,'cpuLimit':1,'memoryLimitBytes':1610612736,'swapLimitBytes':0,'pidLimit':256,'fileSizeLimitBytes':1073741824,'wallClockLimitSeconds':5400,'scratch':{'mode':'tmpfs','maxBytes':1153433600},'environmentAllowlist':['PATH','HOME','TMPDIR','CI','NODE_ENV','AUDIT_SOURCE_SHA','AUDIT_ARCHIVE_SHA256','AUDIT_TREE_MANIFEST_SHA256','AUDIT_EXPECTED_IMAGE_DIGEST','AUDIT_LOCK_SHA256','AUDIT_SOURCE_LOCK_SHA256','AUDIT_LAUNCH_RECORD_SHA256','DATABASE_URL','DATABASE_URL_UNPOOLED','TEST_DATABASE_URL'],'requestedTimeoutSeconds':5400,'preflightTimeoutSeconds':180,'promoterStartupTimeoutSeconds':60,'hostInputDir':'/tmp/audit-source','parentPromotionInputDir':'/tmp/audit-stage','artifactVolumeOptions':'size=67108864,mode=0700,uid=10001,gid=10001','promoterLimits':{'cpu':0.25,'memoryBytes':268435456,'swapBytes':0,'pids':32,'fileSizeLimitBytes':10485760},'preflightArguments':['docker','run','--name','preflight','--pull=never','--network=none','--read-only','--user','10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=1','--memory=1536m','--memory-swap=1536m','--pids-limit=256','--ulimit','fsize=1073741824:1073741824','--tmpfs','/scratch:rw,noexec,nosuid,nodev,size=1153433600,uid=10001,gid=10001,mode=0700','--mount','type=bind,source=x,target=/input,readonly','--mount','type=bind,source=x,target=/runner,readonly','--env','AUDIT_SOURCE_SHA=abc','--entrypoint','/bin/bash','sha256:abc','/runner/preflight.sh'],'targetArgumentsTemplate':['docker','run','--network=none','--read-only','--user','10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=1','--memory=1536m','--memory-swap=1536m','--pids-limit=256','--mount','type=bind,source=x,target=/input,readonly','--mount','type=bind,source=x,target=/runner,readonly','--tmpfs','/scratch:rw,noexec,nosuid,nodev,size=1153433600,uid=10001,gid=10001,mode=0700'],'promoterArguments':['docker','run','--network=none','--read-only','--user','10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=0.25','--memory=256m','--memory-swap=256m','--pids-limit=32','--mount','type=bind,source=/tmp/runner,target=/runner,readonly','--mount','type=bind,source=/tmp/audit-stage,target=/scratch,readonly','--mount','type=volume,source=x,target=/artifacts']}
  self.execution['artifactVolume']='csp-artifacts-'+'a'*32
  self.execution['promoterArguments'][-1]='type=volume,source='+self.execution['artifactVolume']+',target=/artifacts'
 def test_accepts_recorded_bounded_launcher_configuration(self): validate_execution(self.execution)
 def test_accepts_selected_non_10001_identity_across_trusted_containers_and_volumes(self):
  identity='2345:3456';uid,gid=identity.split(':')
  self.execution['uid']=int(uid);self.execution['gid']=int(gid)
  for key in ('preflightArguments','targetArgumentsTemplate','promoterArguments'):
   args=self.execution[key];user_index=args.index('--user');args[user_index+1]=identity
  scratch='/scratch:rw,noexec,nosuid,nodev,size=1153433600,uid=2345,gid=3456,mode=0700'
  for key in ('preflightArguments','targetArgumentsTemplate'):
   args=self.execution[key];tmpfs_index=args.index('--tmpfs');args[tmpfs_index+1]=scratch
  self.execution['artifactVolumeOptions']='size=67108864,mode=0700,uid=2345,gid=3456'
  validate_execution(self.execution)
 def test_rejects_invalid_or_inconsistent_container_identity(self):
  for key,value in (('uid',0),('uid',-1),('uid',True),('uid',2**32),('gid',0),('gid',-1),('gid',True),('gid',2**32)):
   altered=dict(self.execution);altered[key]=value
   with self.subTest(identity_field=key,value=value),self.assertRaisesRegex(ValueError,'identity'):
    validate_execution(altered)
  for key in ('preflightArguments','targetArgumentsTemplate','promoterArguments'):
   altered=dict(self.execution);altered[key]=list(self.execution[key]);i=altered[key].index('--user');altered[key][i+1]='2345:3456'
   with self.subTest(container=key),self.assertRaisesRegex(ValueError,'identity'):
    validate_execution(altered)
  altered=dict(self.execution);altered['targetArgumentsTemplate']=list(self.execution['targetArgumentsTemplate']);altered['targetArgumentsTemplate'].extend(['--user','10001:10001'])
  with self.assertRaisesRegex(ValueError,'identity'):
   validate_execution(altered)
 def test_rejects_artifact_volume_owned_by_a_different_identity(self):
  altered=dict(self.execution);altered['uid']=2345;altered['gid']=3456
  for key in ('preflightArguments','targetArgumentsTemplate','promoterArguments'):
   altered[key]=list(self.execution[key]);i=altered[key].index('--user');altered[key][i+1]='2345:3456'
  for key in ('preflightArguments','targetArgumentsTemplate'):
   i=altered[key].index('--tmpfs');altered[key][i+1]='/scratch:rw,noexec,nosuid,nodev,size=1153433600,uid=2345,gid=3456,mode=0700'
  altered['artifactVolumeOptions']='size=67108864,mode=0700,uid=10001,gid=10001'
  with self.assertRaisesRegex(ValueError,'artifact volume'):
   validate_execution(altered)
 def test_rejects_artifact_volume_exposure_to_target_or_preflight(self):
  for key in ('targetArgumentsTemplate','preflightArguments'):
   altered=dict(self.execution);altered[key]=list(self.execution[key]);altered[key].extend(['--mount','type=volume,source='+self.execution['artifactVolume']+',target=/scratch'])
   with self.subTest(container=key),self.assertRaisesRegex(ValueError,'artifact volume'):
    validate_execution(altered)
 def test_rejects_promoter_mount_of_a_different_artifact_volume(self):
  altered=dict(self.execution);altered['promoterArguments']=list(self.execution['promoterArguments']);altered['promoterArguments'][-1]='type=volume,source=csp-artifacts-'+'b'*32+',target=/artifacts'
  with self.assertRaisesRegex(ValueError,'selected artifact volume'):
   validate_execution(altered)
 def test_requires_promoter_runner_mount_to_be_read_only(self):
  altered=dict(self.execution); altered['promoterArguments']=[item for item in self.execution['promoterArguments'] if 'target=/runner,readonly' not in item]
  with self.assertRaisesRegex(ValueError,'trusted-promoter Docker arguments'): validate_execution(altered)
 def test_rejects_target_artifact_mount_or_docker_socket(self):
  for bad in ('type=volume,source=x,target=/artifacts','type=bind,source=\\.\\pipe\\docker_engine,target=/var/run/docker.sock'):
   altered=dict(self.execution); altered['targetArgumentsTemplate']=self.execution['targetArgumentsTemplate']+[bad]
   with self.assertRaisesRegex(ValueError,'Docker arguments'): validate_execution(altered)
 def test_rejects_shared_or_unbounded_target_scratch(self):
  for replacement in ('/scratch:rw,size=1153433600','/scratch:rw,noexec,nosuid,nodev,size=2147483648,uid=10001,gid=10001,mode=0700'):
   altered=dict(self.execution); altered['targetArgumentsTemplate']=self.execution['targetArgumentsTemplate'][:-1]+[replacement]
   with self.assertRaisesRegex(ValueError,'scratch'):
    validate_execution(altered)
 def test_rejects_unbounded_resources_and_environment(self):
  for key,value in (('memoryLimitBytes',0),('swapLimitBytes',1),('pidLimit',999),('fileSizeLimitBytes',0),('requestedTimeoutSeconds',5401)):
   altered=dict(self.execution); altered[key]=value
   with self.assertRaises(ValueError): validate_execution(altered)
  altered=dict(self.execution); altered['environmentAllowlist']=['PATH','HOME','AWS_SECRET_ACCESS_KEY']
  with self.assertRaisesRegex(ValueError,'environment allowlist'): validate_execution(altered)
 def test_rejects_unbounded_or_incomplete_preflight(self):
  altered=dict(self.execution);altered['preflightTimeoutSeconds']=301
  with self.assertRaisesRegex(ValueError,'preflight timeout'): validate_execution(altered)
  altered=dict(self.execution);altered['preflightArguments']=[item for item in self.execution['preflightArguments'] if item!='--network=none']
  with self.assertRaisesRegex(ValueError,'preflight Docker arguments'): validate_execution(altered)

class ArchiveBindingTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.root=pathlib.Path(self.tmp.name)/'repo'; self.root.mkdir(); self.archive=pathlib.Path(self.tmp.name)/'source.tar'
  self.git=lambda *args: subprocess.run(['git',*args],cwd=self.root,check=True,text=True,capture_output=True).stdout.strip()
  self.git('init','-q'); self.git('config','user.email','test@example.invalid'); self.git('config','user.name','test'); (self.root/'trusted.txt').write_text('selected commit bytes\\n'); self.git('add','trusted.txt'); self.git('commit','-qm','source')
  self.commit=self.git('rev-parse','HEAD'); self.tree=self.git('rev-parse','HEAD^{tree}'); rows=self.git('ls-tree','-rz','-r','--full-tree',self.commit)
  entries=[]
  for row in rows.split(chr(0)):
   if not row: continue
   meta,name=row.split(chr(9),1); mode,kind,oid=meta.split(' '); entries.append({'path':name,'mode':mode,'oid':oid})
  self.manifest={'commit':self.commit,'tree':self.tree,'objectFormat':self.git('rev-parse','--show-object-format'),'entries':entries}
  with open(self.archive,'wb') as output: subprocess.run(['git','archive','--format=tar',self.commit],cwd=self.root,check=True,stdout=output)
 def tearDown(self): self.tmp.cleanup()
 def test_git_archive_payload_matches_selected_git_blobs(self):
  self.assertEqual(verify_archive_payload(self.archive,self.manifest),1)
  with open(self.archive,'rb') as source: marker=subprocess.run(['git','get-tar-commit-id'],stdin=source,check=True,text=True,capture_output=True).stdout.strip()
  self.assertEqual(marker,self.commit)
 def test_archive_with_claimed_commit_but_forged_blob_is_rejected(self):
  forged=pathlib.Path(self.tmp.name)/'forged.tar'
  with tarfile.open(self.archive,'r:') as source, tarfile.open(forged,'w',format=tarfile.PAX_FORMAT,pax_headers={'comment':self.commit}) as target:
   for info in source.getmembers():
    if info.isfile():
     data=source.extractfile(info).read()
     if info.name=='trusted.txt': data=b'forged payload\\n'; info.size=len(data)
     target.addfile(info,io.BytesIO(data))
    else: target.addfile(info)
  with open(forged,'rb') as source: marker=subprocess.run(['git','get-tar-commit-id'],stdin=source,check=True,text=True,capture_output=True).stdout.strip()
  self.assertEqual(marker,self.commit)
  with self.assertRaisesRegex(ValueError,'blob does not match'): verify_archive_payload(forged,self.manifest)
if __name__=='__main__': unittest.main()

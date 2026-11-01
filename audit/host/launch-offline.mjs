import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const PROJECT=path.resolve(HERE,'../..');
const IMAGE_DIGEST='sha256:e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3';
const MAX_ARCHIVE=600*1024*1024;
const SENSITIVE_DIRECTORY=/^(?:credentials?|secrets?|tokens?|passwords?)$/i;
const SENSITIVE_DATA_FILE=/^(?:credentials?|secrets?|tokens?|passwords?)(?:\..*)?$/i;
const REVIEWED_SENSITIVE_SOURCE_PATHS=new Set(['api/src/modules/auth/password.ts','api/tests/auth/password.test.ts']);
function isSecretPath(name){
 const parts=name.split('/');const file=parts.at(-1)||'';
 if(parts.some(part=>/^\.env(?:$|\.)/i.test(part)))return name!=='.env.example';
 if(parts.slice(0,-1).some(part=>SENSITIVE_DIRECTORY.test(part)))return true;
 if(/^(?:id_rsa|id_ed25519)(?:\..*)?$/i.test(file)||/\.(?:pem|key)$/i.test(file))return true;
 return SENSITIVE_DATA_FILE.test(file)&&!REVIEWED_SENSITIVE_SOURCE_PATHS.has(name);
}
const ENV_TEMPLATE_KEYS=new Set(['NODE_ENV','PORT','HOST','PGPORT','WEB_PORT','POSTGRES_SUPERUSER_PASSWORD','APP_DB_PASSWORD','TEST_DB_PASSWORD','DATABASE_URL','DATABASE_URL_UNPOOLED','TEST_DATABASE_URL','SESSION_SECRET','APP_ORIGIN']);
const SAFE_ENV_PLACEHOLDERS=new Set(['LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE','REPLACE_IN_LOCAL_ENV_WITH_RANDOM_VALUE']);
const FORBIDDEN_PART=/(^|\/)(?:node_modules|\.cache|\.npm|\.turbo|\.vite|\.next|coverage|playwright-report|test-results|output|backups?)(?:\/|$)/i;
function runGit(repoRoot,args,{encoding='utf8',input}={}) {
 const result=spawnSync('git',args,{cwd:repoRoot,encoding,input,maxBuffer:32*1024*1024,windowsHide:true});
 if(result.error) throw result.error; if(result.status!==0) throw new Error('git '+args.join(' ')+' failed: '+String(result.stderr||'').trim()); return result.stdout;
}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function gitArchiveCommit(archivePath,repoRoot){
 const child=spawn('git',['get-tar-commit-id'],{cwd:repoRoot,windowsHide:true,stdio:['pipe','pipe','pipe']}); let stdout='',stderr=''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdout.on('data',x=>stdout+=x); child.stderr.on('data',x=>stderr+=x);
 const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});let inputError=null;
 try{await pipeline(createReadStream(archivePath),child.stdin);}catch(error){inputError=error;}
 const code=await closed;const marker=stdout.trim();
 if(code!==0) throw new Error('git get-tar-commit-id failed: '+stderr.trim());
 if(inputError&&!(['EPIPE','ERR_STREAM_PREMATURE_CLOSE'].includes(inputError.code)&&/^[0-9a-f]{40}$/.test(marker)))throw inputError;
 if(!/^[0-9a-f]{40}$/.test(marker))throw new Error('git archive commit marker is invalid');return marker;
}
export function validateEnvExample(content){
 if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>65536||content.includes('\0'))throw new Error('environment template exceeds bounds or contains invalid text');
 const values=new Map();
 for(const [index,raw] of content.split(/\r?\n/).entries()){
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  const match=/^([A-Z][A-Z0-9_]*)=([^\r\n]*)$/.exec(line);if(!match)throw new Error('environment template has invalid assignment syntax at line '+(index+1));
  const [,key,value]=match;if(!ENV_TEMPLATE_KEYS.has(key))throw new Error('environment template has an unreviewed variable: '+key);if(values.has(key))throw new Error('environment template repeats a variable: '+key);values.set(key,value);
 }
 for(const key of ENV_TEMPLATE_KEYS)if(!values.has(key))throw new Error('environment template is missing required variable: '+key);
 const fixed={NODE_ENV:'development',PORT:'3101',HOST:'127.0.0.1',PGPORT:'5433',WEB_PORT:'8080',APP_ORIGIN:'http://localhost:5173'};
 for(const [key,value] of Object.entries(fixed))if(values.get(key)!==value)throw new Error('environment template contains an unsafe or unexpected value for '+key);
 for(const key of ['POSTGRES_SUPERUSER_PASSWORD','APP_DB_PASSWORD','TEST_DB_PASSWORD','SESSION_SECRET'])if(!SAFE_ENV_PLACEHOLDERS.has(values.get(key)))throw new Error('environment template contains a non-placeholder secret value for '+key);
 for(const [key,username,database] of [['DATABASE_URL','support_dev','support_dev'],['DATABASE_URL_UNPOOLED','support_dev','support_dev'],['TEST_DATABASE_URL','support_test','support_test']]){
  let url;try{url=new URL(values.get(key));}catch{throw new Error('environment template has an invalid local database URL: '+key);}
  if(url.protocol!=='postgresql:'||url.hostname!=='localhost'||url.port!=='5433'||decodeURIComponent(url.username)!==username||decodeURIComponent(url.password)!=='LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE'||url.pathname!=='/'+database||url.search!=='?schema=public'||url.hash)throw new Error('environment template has an unsafe or non-local database URL: '+key);
 }
 return true;
}
export function validateTrackedSourceTree(repoRoot,commit){
 const raw=runGit(repoRoot,['ls-tree','-rz','-r','--full-tree',commit]);
 const entries=raw.split('\0').filter(Boolean); if(entries.length>50000) throw new Error('source tree exceeds 50,000 tracked entries');
 for(const entry of entries){
  const tab=entry.indexOf('\t'); if(tab<0) throw new Error('malformed git tree entry'); const meta=entry.slice(0,tab),name=entry.slice(tab+1); const mode=meta.split(' ')[0];
  if(mode==='120000') throw new Error('symlink source entry refused: '+name);
  if(mode==='160000') throw new Error('gitlink/submodule source entry refused: '+name);
  if(isSecretPath(name)) throw new Error('secret or credential path refused: '+name);
  if(FORBIDDEN_PART.test(name)) throw new Error('cache/output path refused: '+name);
  if(name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')) throw new Error('unsafe source path refused');
 }
 const template=spawnSync('git',['show',commit+':.env.example'],{cwd:repoRoot,encoding:'utf8',windowsHide:true,maxBuffer:65536});
 if(template.status===0)validateEnvExample(template.stdout);
 else if(entries.some(entry=>entry.slice(entry.indexOf('\t')+1)==='.env.example'))throw new Error('root environment template could not be read safely');
 return runGit(repoRoot,['rev-parse',commit+'^{tree}']).trim();
}
function buildTreeManifest(repoRoot,commit,tree){
 const objectFormat=runGit(repoRoot,['rev-parse','--show-object-format']).trim();if(!['sha1','sha256'].includes(objectFormat))throw new Error('unsupported Git object format');
 const attrs=spawnSync('git',['show',commit+':.gitattributes'],{cwd:repoRoot,encoding:'utf8',windowsHide:true});if(attrs.status===0&&/^\s*[^#].*\bexport-(?:ignore|subst)\b/m.test(attrs.stdout))throw new Error('Git archive export-ignore/export-subst attributes are refused');
 const entries=runGit(repoRoot,['ls-tree','-rz','-r','--full-tree',commit]).split('\0').filter(Boolean).map(entry=>{
  const tab=entry.indexOf('\t');const fields=entry.slice(0,tab).split(' ');const mode=fields[0],type=fields[1],oid=fields[2],name=entry.slice(tab+1);if(!['100644','100755'].includes(mode)||type!=='blob')throw new Error('unsupported Git tree entry: '+name);return {path:name,mode,oid};
 });
 return {commit,tree,objectFormat,entries};
}
async function hashFile(filename){const h=createHash('sha256');for await(const chunk of createReadStream(filename))h.update(chunk);return h.digest('hex');}
export async function verifyLauncherLocation(repoRoot){
 const repo=await (await import('node:fs/promises')).realpath(repoRoot);const running=await (await import('node:fs/promises')).realpath(fileURLToPath(import.meta.url));let expected;try{expected=await (await import('node:fs/promises')).realpath(path.join(repo,'audit/host/launch-offline.mjs'));}catch{throw new Error('selected source repository does not contain its trusted launcher');}
 if(running!==expected)throw new Error('trusted launcher must be loaded from the selected source repository');return running;
}
export async function prepareSourceSnapshot({repoRoot,commit,outputDir,toolchainDigest=IMAGE_DIGEST,lane='api',maxArchiveBytes=MAX_ARCHIVE,launcherVersion='audit-launcher-v1'}={}){
 if(!repoRoot||!commit||!outputDir) throw new Error('repoRoot, explicit commit, and outputDir are required');
 if(!/^[0-9a-f]{40}$/.test(commit)) throw new Error('explicit commit must be a full 40-character SHA');
 if(toolchainDigest!==IMAGE_DIGEST) throw new Error('toolchain image digest differs from the prepared immutable image');
 if(!['api','web','browser','browser-smoke','all'].includes(lane)) throw new Error('unsupported fixed audit lane');
 const actualHead=runGit(repoRoot,['rev-parse','HEAD']).trim(); if(actualHead!==commit) throw new Error('selected commit is not the current HEAD');
 const dirty=runGit(repoRoot,['status','--porcelain','--untracked-files=all']).trim(); if(dirty) throw new Error('source worktree must be clean');
 const tree=validateTrackedSourceTree(repoRoot,commit); const treeManifest=buildTreeManifest(repoRoot,commit,tree); await mkdir(outputDir,{recursive:true,mode:0o700});
 const resolvedRepo=await (await import('node:fs/promises')).realpath(repoRoot);const resolvedOutput=await (await import('node:fs/promises')).realpath(outputDir);const outputRel=path.relative(resolvedRepo,resolvedOutput);if(outputRel===''||(!outputRel.startsWith('..'+path.sep)&&outputRel!=='..'&&!path.isAbsolute(outputRel)))throw new Error('private archive output must be outside the source repository');
 const outputStat=await (await import('node:fs/promises')).lstat(outputDir); if(!outputStat.isDirectory()||outputStat.isSymbolicLink())throw new Error('private archive output must be a real directory');
 if((await (await import('node:fs/promises')).readdir(outputDir)).length!==0)throw new Error('private archive output directory must be empty');
 const archivePath=path.join(outputDir,'source.tar'); runGit(repoRoot,['-c','core.autocrlf=false','archive','--format=tar','--output='+archivePath,commit]);
 const archiveStat=await stat(archivePath); if(archiveStat.size<=0||archiveStat.size>maxArchiveBytes) throw new Error('source archive size is outside the configured bound');
 const archiveSha256=await hashFile(archivePath); const archiveCommit=await gitArchiveCommit(archivePath,repoRoot);
 if(archiveCommit!==commit) throw new Error('Git archive commit marker does not match selected commit');
 const treeManifestPath=path.join(outputDir,'source-tree-manifest.json');const treeManifestBytes=Buffer.from(JSON.stringify(treeManifest,null,2)+'\n');await writeFile(treeManifestPath,treeManifestBytes,{mode:0o600,flag:'wx'});const treeManifestSha256=sha(treeManifestBytes);
 const [launcherSha256,promoterSha256,preflightSha256,runnerSha256,verifierSha256,manifestBytes]=await Promise.all([
  hashFile(path.join(HERE,'launch-offline.mjs')),hashFile(path.resolve(HERE,'../run/promote_artifacts.py')),hashFile(path.resolve(HERE,'../run/preflight.sh')),hashFile(path.resolve(HERE,'../run/run-offline.sh')),hashFile(path.resolve(HERE,'../run/verify_input.py')),readFile(path.join(repoRoot,'audit/provision/toolchain-manifest.json'))]);
 const manifest=JSON.parse(manifestBytes.toString('utf8')); if(manifest.image_id!==toolchainDigest) throw new Error('toolchain manifest image ID does not match selected immutable image');
 const safeConfig={platform:'linux/amd64',network:'none',rootFilesystem:'read-only',sourceMount:'read-only',toolchainMount:'read-only',scratch:{mode:'tmpfs',maxBytes:1153433600},artifactsMount:'promoter-only',dockerSocket:'parent-launcher-only',uid:10001,gid:10001,capabilities:'drop-all',noNewPrivileges:true,cpuLimit:1,memoryLimitBytes:1610612736,swapLimitBytes:0,pidLimit:256,fileSizeLimitBytes:1073741824,wallClockLimitSeconds:5400,environmentAllowlist:['PATH','HOME','TMPDIR','CI','NODE_ENV','AUDIT_SOURCE_SHA','AUDIT_ARCHIVE_SHA256','AUDIT_TREE_MANIFEST_SHA256','AUDIT_EXPECTED_IMAGE_DIGEST','AUDIT_LOCK_SHA256','AUDIT_LAUNCH_RECORD_SHA256','DATABASE_URL','DATABASE_URL_UNPOOLED','TEST_DATABASE_URL'],lane};
 const record={recordVersion:1,createdAt:new Date().toISOString(),source:{commit,tree,objectFormat:treeManifest.objectFormat,treeEntries:treeManifest.entries.length,treeManifestSha256,archiveCommit,archiveSha256,archiveSize:archiveStat.size},toolchain:{imageDigest:toolchainDigest,manifestSha256:sha(manifestBytes),lockfileSha256:manifest.target_lockfile_sha256,prismaSchemaSha256:manifest.prisma_schema_sha256},trustedCode:{launcherVersion,launcherSha256,promoterSha256,preflightSha256,runnerSha256,verifierSha256},execution:safeConfig};
 const recordPath=path.join(outputDir,'launch-record.json'); await writeFile(recordPath,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});
 return {...record,archivePath,treeManifestPath,recordPath,recordSha256:await hashFile(recordPath)};
}
function docker(args,timeout=30000){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:4*1024*1024});if(r.error)throw r.error;if(r.status!==0)throw new Error('docker '+args[0]+' failed: '+String(r.stderr||r.stdout||'').trim());return String(r.stdout||'').trim();}
function makeVolume(name,size){docker(['volume','create','--driver','local','--opt','type=tmpfs','--opt','device=tmpfs','--opt','o=size='+size+',mode=0700,uid=10001,gid=10001',name]);}
function closeCode(child){return new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});}
export function formatPromoterDiagnostics(stdout='',stderr=''){
 return [stdout,stderr].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().slice(-2000);
}
export function promoterExitMessage(code,signal,stderr=''){
 const detail=formatPromoterDiagnostics('',stderr);
 return 'promoter exited early: '+code+'/'+signal+(detail?'; stderr: '+detail:'');
}
export function summarizeTargetOutcome(target){
 if(!target)return {started:false};
 const stdout=Buffer.from(String(target.stdout||''));const stderr=Buffer.from(String(target.stderr||''));
 return {started:true,exitCode:Number.isInteger(target.exitCode)?target.exitCode:null,signal:target.signal||null,timedOut:target.timedOut===true,outputTruncated:target.truncated===true,stdoutBytes:Number.isSafeInteger(target.stdoutObservedBytes)?target.stdoutObservedBytes:stdout.length,stderrBytes:Number.isSafeInteger(target.stderrObservedBytes)?target.stderrObservedBytes:stderr.length,stdoutCapturedBytes:stdout.length,stderrCapturedBytes:stderr.length,stdoutCapturedSha256:sha(stdout),stderrCapturedSha256:sha(stderr)};
}
export function safeTargetDiagnostic(stderr=''){
 const sensitive=/(?:password|secret|token|cookie|authorization|bearer|postgres(?:ql)?:\/\/|https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i;
 for(const raw of String(stderr).replace(/\r/g,'').split('\n')){
  const line=raw.trim();if(!line||line.length>512)continue;
  const recognized=/^(?:\/runner\/(?:run-offline|preflight)\.sh|\/bin\/bash):\d+: |^(?:mkdir|chmod|find|exec): |^docker: Error response from daemon: |^(?:PREFLIGHT_FAIL|AUDIT_RUN_REFUSED): /.test(line);
  if(!recognized||sensitive.test(line)||!/^[A-Za-z0-9_./ :(),'"`=+\\-]+$/.test(line))continue;
  return line.replace(/[A-Za-z]:\\[^\s'"<>]+/g,'[HOST_PATH]');
 }
 return 'target stderr omitted: sensitive or unrecognized content';
}
function redactCapturedOutput(value){
 return String(value||'')
  .replace(/\b(postgres|postgresql):\/\/[^@\s]+@/gi,'$1://[REDACTED]@')
  .replace(/\bBearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/\b(password|secret|token|cookie|authorization|api[-_]?key)\b(\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1$2[REDACTED]')
  .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,'[EMAIL]')
  .replace(/[A-Za-z]:\\[^\s'"<>]+/g,'[HOST_PATH]');
}
export async function writePromotionInputs({directory,preflight,target,lane,commit,runId}={}){
 if(!directory||!preflight||!target||!['api','web','browser','browser-smoke','all'].includes(lane)||!/^[0-9a-f]{40}$/.test(commit||'')||!/^audit-[A-Za-z0-9._-]{1,60}$/.test(runId||''))throw new Error('invalid parent promotion input metadata');
 const requested=path.resolve(directory);const actual=await realpath(requested);const dst=await lstat(directory);if(actual!==requested||!dst.isDirectory()||dst.isSymbolicLink())throw new Error('promotion input must be an existing real directory');
 if((await (await import('node:fs/promises')).readdir(directory)).length!==0)throw new Error('promotion input directory must be empty');
 const preflightBytes=Buffer.from(redactCapturedOutput('--- stdout ---\n'+String(preflight.stdout||'')+'\n--- stderr ---\n'+String(preflight.stderr||''))+'\n');
 const laneBytes=Buffer.from(redactCapturedOutput('--- stdout ---\n'+String(target.stdout||'')+'\n--- stderr ---\n'+String(target.stderr||''))+'\n');
 const laneResult={runId,commit,lane,exitCode:Number.isInteger(target.exitCode)?target.exitCode:null,signal:target.signal||null,timedOut:target.timedOut===true,outputTruncated:target.truncated===true,stdoutObservedBytes:Number.isSafeInteger(target.stdoutObservedBytes)?target.stdoutObservedBytes:Buffer.byteLength(String(target.stdout||'')),stderrObservedBytes:Number.isSafeInteger(target.stderrObservedBytes)?target.stderrObservedBytes:Buffer.byteLength(String(target.stderr||'')),stdoutCapturedSha256:sha(Buffer.from(String(target.stdout||''))),stderrCapturedSha256:sha(Buffer.from(String(target.stderr||''))),preflightExitCode:Number.isInteger(preflight.exitCode)?preflight.exitCode:null,capturedTextBytes:preflightBytes.length+laneBytes.length};
 const files={'preflight.out':preflightBytes,'lane.log':laneBytes,'lane-result.json':Buffer.from(JSON.stringify(laneResult,null,2)+'\n')};const total=Object.values(files).reduce((sum,data)=>sum+data.length,0);if(total>20*1024*1024||Object.values(files).some(data=>data.length>8*1024*1024))throw new Error('captured output exceeds promotion bounds');
 const hashes={};for(const [name,data] of Object.entries(files)){const file=path.join(directory,name);await writeFile(file,data,{mode:0o600,flag:'wx'});const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size!==data.length)throw new Error('parent promotion input failed file identity checks: '+name);hashes[name]=sha(data);}
 return {files:Object.keys(files),sha256:hashes,totalBytes:total,laneResult};
}
function nextLine(rl,child,timeoutMs,stderr=()=> ''){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('timed out waiting for trusted promoter')),timeoutMs);const onLine=line=>{clearTimeout(timer);rl.off('line',onLine);resolve(line);};rl.once('line',onLine);child.once('close',(code,signal)=>{clearTimeout(timer);rl.off('line',onLine);reject(new Error(promoterExitMessage(code,signal,stderr())));});});}
async function runDockerTarget(args,name,timeoutMs){const child=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});const limit=2*1024*1024;let out=[],err=[],outKept=0,errKept=0,outSeen=0,errSeen=0,timedOut=false,truncated=false;for(const pair of [[child.stdout,'out'],[child.stderr,'err']])pair[0].on('data',chunk=>{const data=Buffer.from(chunk);if(pair[1]==='out'){outSeen+=data.length;const keep=Math.min(data.length,Math.max(0,limit-outKept));if(keep)out.push(data.subarray(0,keep));outKept+=keep;if(outSeen>limit)truncated=true;}else{errSeen+=data.length;const keep=Math.min(data.length,Math.max(0,limit-errKept));if(keep)err.push(data.subarray(0,keep));errKept+=keep;if(errSeen>limit)truncated=true;}});const timer=setTimeout(()=>{timedOut=true;try{spawnSync('docker',['kill','--signal','KILL',name],{windowsHide:true,timeout:15000});}catch{}},timeoutMs);const end=await closeCode(child);clearTimeout(timer);return {exitCode:end.code,signal:end.signal,timedOut,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8'),stdoutObservedBytes:outSeen,stderrObservedBytes:errSeen,truncated};}
async function makeEvidenceRun(repoRoot,evidenceDir,runId){await mkdir(evidenceDir,{recursive:true});const requested=path.resolve(evidenceDir);const actual=await (await import('node:fs/promises')).realpath(requested);if(actual!==requested)throw new Error('evidence destination must not traverse a symlink');const repo=await (await import('node:fs/promises')).realpath(repoRoot);const rel=path.relative(repo,actual);if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw new Error('audit evidence must be outside the repository');const out=path.join(actual,runId);await mkdir(out,{mode:0o700});return out;}
export async function removePrivateInputDir(inputDir){
 const root=await realpath(os.tmpdir());const actual=await realpath(inputDir);const st=await lstat(inputDir);
 if(!st.isDirectory()||st.isSymbolicLink()||path.dirname(actual)!==root||!path.basename(actual).startsWith('csp-audit-input-'))throw new Error('refusing to remove an unverified audit input directory');
 await rm(actual,{recursive:true,force:false,maxRetries:0});
}
async function removePrivatePromotionDir(directory){
 const root=await realpath(os.tmpdir());const actual=await realpath(directory);const st=await lstat(directory);
 if(!st.isDirectory()||st.isSymbolicLink()||path.dirname(actual)!==root||!path.basename(actual).startsWith('csp-audit-promote-'))throw new Error('refusing to remove an unverified promotion input directory');
 await rm(actual,{recursive:true,force:false,maxRetries:0});
}
export async function launchSandbox({repoRoot,commit,lane,evidenceDir,timeoutSeconds=5400}){
 if(!evidenceDir)throw new Error('external evidence directory is required');if(timeoutSeconds<1||timeoutSeconds>5400)throw new Error('timeout must be 1..5400 seconds');
 const nonce=randomUUID().replaceAll('-','');const runId='audit-'+commit.slice(0,12)+'-'+Date.now()+'-'+nonce.slice(0,8);const runDir=await makeEvidenceRun(repoRoot,evidenceDir,runId);
 const inputDir=await (await import('node:fs/promises')).mkdtemp(path.join(os.tmpdir(),'csp-audit-input-'));const promotionDir=await (await import('node:fs/promises')).mkdtemp(path.join(os.tmpdir(),'csp-audit-promote-'));const artifactVolume='csp-artifacts-'+nonce;const preflightName='csp-preflight-'+nonce;const targetName='csp-target-'+nonce;const helperName='csp-promoter-'+nonce;
 let helper=null,helperDone=null,createdArtifacts=false,completed=false,targetOutcome=null,targetDiagnostic='target stderr: unavailable',preflightOutcome=null,preflightDiagnostic='preflight stderr: unavailable';
 try{
  const dockerEndpoint=docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']);if(!dockerEndpoint.startsWith('npipe:')&&!dockerEndpoint.startsWith('unix://')&&!/^tcp:\/(\/)?(127\.0\.0\.1|localhost)(:|$)/.test(dockerEndpoint))throw new Error('Docker context is not a local engine endpoint');const dockerServer=docker(['version','--format','{{.Server.Os}}/{{.Server.Arch}} {{.Server.Version}}']);if(!dockerServer.startsWith('linux/amd64 '))throw new Error('Docker server must be local Linux AMD64');
  const record=await prepareSourceSnapshot({repoRoot,commit,outputDir:inputDir,lane,toolchainDigest:IMAGE_DIGEST});
  makeVolume(artifactVolume,67108864);createdArtifacts=true;
  for(const name of ['preflight.sh','run-offline.sh','promote_artifacts.py','verify_input.py']){const source=path.resolve(HERE,'../run/'+name);const dest=path.join(inputDir,name);await (await import('node:fs/promises')).copyFile(source,dest);await (await import('node:fs/promises')).chmod(dest,0o444);}
  record.execution.hostInputDir=inputDir;record.execution.parentPromotionInputDir=promotionDir;record.execution.dockerEndpointKind=dockerEndpoint.split(':')[0];record.execution.dockerServer=dockerServer;record.execution.dockerContext=docker(['context','show']);record.execution.hostPlatform=os.platform()+'/'+os.arch();record.execution.hostRelease=os.release();record.execution.requestedTimeoutSeconds=timeoutSeconds;record.execution.promoterLimits={cpu:0.25,memoryBytes:268435456,swapBytes:0,pids:32,fileSizeLimitBytes:10485760};record.execution.runId=runId;record.execution.scratchStrategy='private tmpfs attached to target only';record.execution.artifactVolume=artifactVolume;record.execution.inputMount='/input and /runner read-only';record.execution.promoterInputMount='parent-created /scratch read-only; never mounted in target';record.execution.artifactPath='/artifacts, promoter only';record.execution.targetContainerName=targetName;record.execution.preflightContainerName=preflightName;record.execution.promoterContainerName=helperName;record.execution.promotionAfterTargetTermination=true;
  const helperFixed=['--pull=never','--network=none','--read-only','--user','10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges'];
  const helperArgs=['run','--name',helperName,'-i',...helperFixed,'--cpus=0.25','--memory=256m','--memory-swap=256m','--pids-limit=32','--ulimit','fsize=10485760:10485760','--mount','type=bind,source='+inputDir+',target=/runner,readonly','--mount','type=bind,source='+promotionDir+',target=/scratch,readonly','--mount','type=volume,source='+artifactVolume+',target=/artifacts','--env','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','--entrypoint','python3',IMAGE_DIGEST,'/runner/promote_artifacts.py','--serve','/scratch','/artifacts'];
  const env=['--env','PATH=/opt/toolchain/project/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','--env','HOME=/scratch/home','--env','TMPDIR=/scratch/tmp','--env','CI=1','--env','NODE_ENV=test','--env','AUDIT_SOURCE_SHA='+commit,'--env','AUDIT_ARCHIVE_SHA256='+record.source.archiveSha256,'--env','AUDIT_EXPECTED_IMAGE_DIGEST='+IMAGE_DIGEST,'--env','AUDIT_LAUNCH_RECORD_SHA256=<record-sha256-derived-after-serialization>','--env','AUDIT_LOCK_SHA256='+record.toolchain.lockfileSha256,'--env','AUDIT_TREE_MANIFEST_SHA256='+record.source.treeManifestSha256];
  const targetTmpfs='--tmpfs';const tmpfsSpec='/scratch:rw,noexec,nosuid,nodev,size=1153433600,uid=10001,gid=10001,mode=0700';
  const shared=['--pull=never','--network=none','--read-only','--user','10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=1','--memory=1536m','--memory-swap=1536m','--pids-limit=256','--ulimit','fsize=1073741824:1073741824',targetTmpfs,tmpfsSpec,'--mount','type=bind,source='+inputDir+',target=/input,readonly','--mount','type=bind,source='+inputDir+',target=/runner,readonly',...env];
  const targetArgs=['run','--name',targetName,'--init',...shared,'--entrypoint','/bin/bash',IMAGE_DIGEST,'/runner/run-offline.sh',lane];
  const preflightEnv=[...env,'--env','DATABASE_URL=postgresql://support_dev:audit-only@127.0.0.1:5432/support_dev','--env','DATABASE_URL_UNPOOLED=postgresql://support_dev:audit-only@127.0.0.1:5432/support_dev','--env','TEST_DATABASE_URL=postgresql://support_test:audit-only@127.0.0.1:5432/support_test'];
  const preflightArgs=['run','--name',preflightName,'--pull=never','--network=none','--read-only','--user','10001:10001','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=1','--memory=1536m','--memory-swap=1536m','--pids-limit=256','--ulimit','fsize=1073741824:1073741824',targetTmpfs,tmpfsSpec,'--mount','type=bind,source='+inputDir+',target=/input,readonly','--mount','type=bind,source='+inputDir+',target=/runner,readonly',...preflightEnv,'--entrypoint','/bin/bash',IMAGE_DIGEST,'/runner/preflight.sh'];
  record.execution.promoterArguments=['docker',...helperArgs];record.execution.preflightArguments=['docker',...preflightArgs];record.execution.targetArgumentsTemplate=['docker',...targetArgs];record.execution.launchRecordHashPlaceholder='The value paired with AUDIT_LAUNCH_RECORD_SHA256 is replaced with the SHA-256 of serialized launch-record.json immediately before spawn; all other argv values are exact.';
  await writeFile(record.recordPath,JSON.stringify(record,null,2)+'\n',{mode:0o400});const recordSha=await hashFile(record.recordPath);const bindHash=(args)=>{const copy=[...args];const i=copy.findIndex(item=>item.startsWith('AUDIT_LAUNCH_RECORD_SHA256='));if(i<0)throw new Error('launch record hash environment slot is missing');copy[i]='AUDIT_LAUNCH_RECORD_SHA256='+recordSha;return copy;};const actualTargetArgs=bindHash(targetArgs);const actualPreflightArgs=bindHash(preflightArgs);
  const preflight=await runDockerTarget(actualPreflightArgs,preflightName,30000);preflightOutcome=summarizeTargetOutcome(preflight);preflightDiagnostic=safeTargetDiagnostic(preflight.stderr);const preflightState=JSON.parse(docker(['inspect',preflightName,'--format','{{json .State}}']));if(preflightState.Running||preflightState.Status!=='exited')throw new Error('preflight termination is not confirmed');docker(['rm',preflightName]);if(preflight.exitCode!==0||preflight.timedOut||preflight.truncated)throw new Error('bounded sandbox preflight failed or its output was truncated; target code was not run');
  helper=spawn('docker',helperArgs,{windowsHide:true,stdio:['pipe','pipe','pipe']});let helperError='';helper.stderr.setEncoding('utf8');helper.stderr.on('data',chunk=>{if(helperError.length<65536)helperError+=chunk;});helperDone=closeCode(helper);const lines=createInterface({input:helper.stdout});const ready=JSON.parse(await nextLine(lines,helper,15000,()=>helperError));if(ready.ready!==true||ready.platform!=='linux')throw new Error('trusted Linux promoter did not retain parent promotion descriptors');
  const target=await runDockerTarget(actualTargetArgs,targetName,timeoutSeconds*1000);targetOutcome=summarizeTargetOutcome(target);targetDiagnostic=safeTargetDiagnostic(target.stderr);const state=JSON.parse(docker(['inspect',targetName,'--format','{{json .State}}']));if(state.Running||state.Status!=='exited')throw new Error('target termination is not confirmed; retain parent promotion inputs');docker(['rm',targetName]);
  const stage=await writePromotionInputs({directory:promotionDir,preflight,lane,commit,runId,target});
  const request={run_id:runId,files:['preflight.out','lane.log','lane-result.json'],per_file_limit:8388608,total_limit:20971520};helper.stdin.write(JSON.stringify(request)+'\n');const promoted=JSON.parse(await nextLine(lines,helper,20000));if(promoted.promoted!==true)throw new Error('trusted promotion failed: '+helperError);
  for(const name of request.files){const dest=path.join(runDir,name);docker(['cp',helperName+':/artifacts/'+runId+'/'+name,dest]);const st=await (await import('node:fs/promises')).lstat(dest);if(!st.isFile()||st.isSymbolicLink())throw new Error('retained output is not a regular file');if(await hashFile(dest)!==promoted.sha256[name])throw new Error('retained output digest differs from the Linux promotion digest');}
  helper.stdin.write(JSON.stringify({ack:runId})+'\n');helper.stdin.end();const helperComplete=JSON.parse(await nextLine(lines,helper,10000));const ended=await helperDone;if(helperComplete.complete!==true||helperComplete.run_id!==runId||ended.code!==0)throw new Error('trusted promoter did not confirm parent copy completion: '+helperError);const helperFinalState=JSON.parse(docker(['inspect',helperName,'--format','{{json .State}}']));if(helperFinalState.Running||helperFinalState.Status!=='exited')throw new Error('promoter termination is not confirmed');
  await (await import('node:fs/promises')).copyFile(record.recordPath,path.join(runDir,'launch-record.json'));await (await import('node:fs/promises')).copyFile(record.treeManifestPath,path.join(runDir,'source-tree-manifest.json'));await writeFile(path.join(runDir,'execution-result.json'),JSON.stringify({runId,commit,tree:record.source.tree,lane,exitCode:target.exitCode,timeout:target.timedOut,signal:target.signal,containerState:state,oomKilled:state.OOMKilled,outputTruncated:target.truncated,outputSha256:promoted.sha256,parentPromotionInputSha256:stage.sha256,preflightExitCode:preflight.exitCode,preflightContainerState:preflightState,preflightOutputTruncated:preflight.truncated,network:'none',targetHadArtifactMount:false,targetHadDockerSocket:false,targetHadPromotionInputMount:false,completedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600,flag:'wx'});
  docker(['rm',targetName]);docker(['rm',helperName]);completed=true;if(target.exitCode!==0||target.timedOut||target.truncated)throw new Error('bounded lane failed or output was truncated; evidence retained at '+runDir);return {runId,runDir,source:record.source,execution:{exitCode:target.exitCode,containerState:state,outputSha256:promoted.sha256}};
 }catch(error){if(helper&&helper.exitCode===null){try{helper.stdin.end();}catch{}try{await Promise.race([helperDone,new Promise(resolve=>setTimeout(resolve,3000))]);}catch{}}let helperOutput='',helperState='';try{const logs=spawnSync('docker',['logs',helperName],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:65536});helperOutput=formatPromoterDiagnostics(logs.stdout||'',logs.stderr||'');}catch{}try{const state=spawnSync('docker',['inspect',helperName,'--format','{{json .State}}'],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:65536});helperState=formatPromoterDiagnostics(state.stdout||'',state.stderr||'');}catch{}try{docker(['rm','-f',helperName]);}catch{}try{docker(['rm','-f',targetName]);}catch{}try{docker(['rm','-f',preflightName]);}catch{}try{await writeFile(path.join(runDir,'RECOVERY.txt'),'Parent-owned recovery materials retained for explicit operator reconciliation.\nArtifact volume: '+artifactVolume+'\nSource/runner input directory: '+inputDir+'\nParent promotion input directory: '+promotionDir+'\nTarget scratch: container-private tmpfs (destroyed with target)\nPreflight outcome: '+JSON.stringify(preflightOutcome||{started:false})+'\n'+preflightDiagnostic+'\nTarget outcome (no target output text retained): '+JSON.stringify(targetOutcome||{started:false})+'\n'+targetDiagnostic+'\n'+(helperOutput?'Promoter container output: '+helperOutput+'\n':'')+(helperState?'Promoter container state: '+helperState+'\n':'')+'Error: '+error.message+'\n',{mode:0o600,flag:'wx'});}catch{}throw error;
  }finally{if(completed){try{docker(['volume','rm',artifactVolume]);}catch{}try{await removePrivateInputDir(inputDir);}catch(cleanupError){try{await writeFile(path.join(runDir,'HOST_CLEANUP_REQUIRED.txt'),'The source-bound host input directory could not be removed automatically.\nPath: '+inputDir+'\nError: '+cleanupError.message+'\n',{mode:0o600,flag:'wx'});}catch{}}try{await removePrivatePromotionDir(promotionDir);}catch(cleanupError){try{await writeFile(path.join(runDir,'PROMOTION_INPUT_CLEANUP_REQUIRED.txt'),'Parent promotion input could not be removed automatically.\nPath: '+promotionDir+'\nError: '+cleanupError.message+'\n',{mode:0o600,flag:'wx'});}catch{}}}}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const args=process.argv.slice(2);const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};const repoRoot=value('--repo');const commit=value('--commit');const lane=value('--lane');
 try{
  if(repoRoot)await verifyLauncherLocation(repoRoot);const result=args.includes('--execute')?await launchSandbox({repoRoot,commit,lane,evidenceDir:value('--evidence-dir'),timeoutSeconds:Number(value('--timeout')||5400)}):await prepareSourceSnapshot({repoRoot,commit,outputDir:value('--output'),lane,toolchainDigest:value('--image')||IMAGE_DIGEST});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.execution&&result.execution.exitCode!==0)process.exitCode=1;
 }catch(error){process.stderr.write('LAUNCH_REFUSED: '+error.message+'\n');process.exitCode=2;}
}

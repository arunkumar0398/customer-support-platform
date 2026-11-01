import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { formatPromoterDiagnostics, isSupportedLane, prepareSourceSnapshot, promoterExitMessage, removePrivateInputDir, safeTargetDiagnostic, summarizeTargetOutcome, validateEnvExample, validateTrackedSourceTree, verifyLauncherLocation, writePromotionInputs } from './launch-offline.mjs';
const SAFE_ENV_TEMPLATE='NODE_ENV=development\nPORT=3101\nHOST=127.0.0.1\nPGPORT=5433\nWEB_PORT=8080\nPOSTGRES_SUPERUSER_PASSWORD=LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE\nAPP_DB_PASSWORD=LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE\nTEST_DB_PASSWORD=LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE\nDATABASE_URL=postgresql://support_dev:LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE@localhost:5433/support_dev?schema=public\nDATABASE_URL_UNPOOLED=postgresql://support_dev:LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE@localhost:5433/support_dev?schema=public\nTEST_DATABASE_URL=postgresql://support_test:LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE@localhost:5433/support_test?schema=public\nSESSION_SECRET=REPLACE_IN_LOCAL_ENV_WITH_RANDOM_VALUE\nAPP_ORIGIN=http://localhost:5173\n';
async function repo(t) {
 const root=await mkdtemp(path.join(os.tmpdir(),'audit-binding-')); t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 git('init','-q'); git('config','user.email','test@example.invalid'); git('config','user.name','test');
 const files={'tracked.txt':'trusted source\n','audit/host/launch-offline.mjs':'fixture launcher\n','audit/run/promote_artifacts.py':'fixture promoter\n','audit/run/preflight.sh':'fixture preflight\n','audit/run/run-offline.sh':'fixture runner\n','audit/run/verify_input.py':'fixture verifier\n','package-lock.json':'{"name":"fixture","lockfileVersion":3}\n','api/prisma/schema.prisma':'// fixture schema\n'};
 const fs=await import('node:fs/promises');for(const [name,content] of Object.entries(files)){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await writeFile(file,content);}
 const lock=files['package-lock.json'];const schema=files['api/prisma/schema.prisma'];const digest=value=>createHash('sha256').update(value).digest('hex');
 await fs.mkdir(path.join(root,'audit/provision'),{recursive:true});
 await writeFile(path.join(root,'audit/provision/toolchain-manifest.json'),JSON.stringify({image_id:'sha256:'+'e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3',target_lockfile_sha256:digest(lock),prepared_image_lockfile_sha256:'30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0',prisma_schema_sha256:digest(schema)}));
 git('add','.'); git('commit','-qm','source'); return {root,git};
}
async function readTarMember(archivePath,name){
 const bytes=await readFile(archivePath);let offset=0;
 while(offset+512<=bytes.length){
  const header=bytes.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
  const memberName=header.subarray(0,100).toString('utf8').replace(/\0.*$/s,'');const sizeText=header.subarray(124,136).toString('ascii').replace(/\0.*$/s,'').trim();const size=Number.parseInt(sizeText,8);
  if(!Number.isSafeInteger(size)||size<0)throw new Error('invalid tar member size');const dataStart=offset+512;
  if(memberName===name)return bytes.subarray(dataStart,dataStart+size);
  offset=dataStart+Math.ceil(size/512)*512;
 }
 throw new Error('tar member not found: '+name);
}
test('exposes only fixed offline lanes, including bounded provisioning diagnostics', () => {
 for (const lane of ['api','web','browser','browser-smoke','all','api-provisioning-file','api-provisioning-clean-selected','api-provisioning-foreign-membership']) assert.equal(isSupportedLane(lane),true,lane);
 assert.equal(isSupportedLane('api arbitrary command'),false);
});
test('requires the trusted launcher itself to come from the selected repository', async t => {
 const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..'); assert.match(await verifyLauncherLocation(root),/audit[\\/]host[\\/]launch-offline\.mjs$/);
 const foreign=await mkdtemp(path.join(os.tmpdir(),'foreign-audit-repo-')); t.after(()=>rm(foreign,{recursive:true,force:true}));
 await assert.rejects(verifyLauncherLocation(foreign),/selected source repository/);
});
test('retains bounded promoter stderr when the trusted helper exits before readiness', () => {
 assert.equal(promoterExitMessage(2,null,'PROMOTION_REFUSED: root open failed'),'promoter exited early: 2/null; stderr: PROMOTION_REFUSED: root open failed');
 const long=promoterExitMessage(2,null,'x'.repeat(3000));assert.ok(long.length<=2040);assert.match(long,/^promoter exited early: 2\/null; stderr: x+$/);
});
test('normalizes and bounds retained promoter container output', () => {
 assert.equal(formatPromoterDiagnostics('ready\r\n','PROMOTION_REFUSED: bad root'),'ready PROMOTION_REFUSED: bad root');
 const long=formatPromoterDiagnostics('x'.repeat(3000),'');assert.equal(long.length,2000);assert.match(long,/^x+$/);
});
test('summarizes target failure without retaining target-controlled output text', () => {
 const summary=summarizeTargetOutcome({exitCode:125,signal:null,timedOut:false,truncated:false,stdout:'possibly-sensitive stdout',stderr:'docker startup error'});
 assert.deepEqual(summary,{started:true,exitCode:125,signal:null,timedOut:false,outputTruncated:false,stdoutBytes:25,stderrBytes:20,stdoutCapturedBytes:25,stderrCapturedBytes:20,stdoutCapturedSha256:'f36f1f337da2a156243a258f4303b7df8069f4f86a4c21dd6e348352cac52825',stderrCapturedSha256:'523de8c997b1165dfcd0864507da8948a185b9f0bc4111bc5860b76f135d3e9f'});
 assert.doesNotMatch(JSON.stringify(summary),/possibly-sensitive|docker startup/);
 assert.deepEqual(summarizeTargetOutcome(null),{started:false});
});
test('retains only a bounded allowlisted startup diagnostic line', () => {
 assert.equal(safeTargetDiagnostic("/runner/run-offline.sh:16: mkdir: cannot create directory '/scratch/home': Permission denied\nmore target output"),"/runner/run-offline.sh:16: mkdir: cannot create directory '/scratch/home': Permission denied");
 assert.equal(safeTargetDiagnostic('docker: Error response from daemon: secret=do-not-retain'),'target stderr omitted: sensitive or unrecognized content');
 assert.equal(safeTargetDiagnostic('an arbitrary test assertion containing private data'),'target stderr omitted: sensitive or unrecognized content');
});
test('stages only fixed output files in the parent-owned promotion directory', async t => {
 const directory=await mkdtemp(path.join(os.tmpdir(),'csp-audit-promote-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const result=await writePromotionInputs({directory,lane:'api',commit:'a'.repeat(40),runId:'audit-test-123',preflight:{stdout:'PREFLIGHT_PASS: bounded\n',stderr:'',exitCode:0},target:{stdout:'test output\n',stderr:'password=local-dummy\nuser=agent@example.test\npostgresql://user:local-dummy@127.0.0.1/db\n',exitCode:1,signal:null,timedOut:false,truncated:false,stdoutObservedBytes:12,stderrObservedBytes:105}});
 assert.deepEqual((await (await import('node:fs/promises')).readdir(directory)).sort(),['lane-result.json','lane.log','preflight.out']);
 const log=await readFile(path.join(directory,'lane.log'),'utf8');assert.match(log,/password=\[REDACTED\]/);assert.match(log,/\[EMAIL\]/);assert.match(log,/postgresql:\/\/\[REDACTED\]@/);assert.doesNotMatch(log,/local-dummy|agent@example\.test/);
 const resultFile=JSON.parse(await readFile(path.join(directory,'lane-result.json'),'utf8'));assert.equal(resultFile.commit,'a'.repeat(40));assert.equal(resultFile.exitCode,1);assert.equal(result.totalBytes,Buffer.byteLength(await readFile(path.join(directory,'preflight.out')))+Buffer.byteLength(log)+Buffer.byteLength(await readFile(path.join(directory,'lane-result.json'))));assert.equal(resultFile.capturedTextBytes,Buffer.byteLength(await readFile(path.join(directory,'preflight.out')))+Buffer.byteLength(log));
 await assert.rejects(writePromotionInputs({directory,lane:'api',commit:'a'.repeat(40),runId:'audit-test-456',preflight:{stdout:'',stderr:'',exitCode:0},target:{stdout:'',stderr:'',exitCode:0}}),/empty/);
});
test('removes only a real direct child of the private host temp directory', async t => {
 const input=await mkdtemp(path.join(os.tmpdir(),'csp-audit-input-test-')); await writeFile(path.join(input,'source.tar'),'synthetic source');
 await removePrivateInputDir(input); await assert.rejects(readFile(path.join(input,'source.tar')));
 const outside=await mkdtemp(path.join(os.tmpdir(),'unrelated-audit-test-')); t.after(()=>rm(outside,{recursive:true,force:true}));
 const link=path.join(os.tmpdir(),'csp-audit-input-link-'+Date.now()); await symlink(outside,link); t.after(()=>rm(link,{force:true}));
 await assert.rejects(removePrivateInputDir(link),/unverified/); await writeFile(path.join(outside,'keep.txt'),'preserved'); assert.equal(await readFile(path.join(outside,'keep.txt'),'utf8'),'preserved');
});
test('binds clean exact HEAD to git archive marker, tree and bytes', async t => {
 const {root,git}=await repo(t); const outputDir=await mkdtemp(path.join(os.tmpdir(),'audit-out-')); t.after(()=>rm(outputDir,{recursive:true,force:true}));
 const result=await prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir,toolchainDigest:'sha256:e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3',launcherVersion:'test'});
 assert.equal(result.source.commit,git('rev-parse','HEAD')); assert.equal(result.source.tree,git('rev-parse','HEAD^{tree}')); assert.equal(result.source.archiveCommit,result.source.commit); assert.match(result.source.archiveSha256,/^[a-f0-9]{64}$/);
 assert.equal((await readFile(result.archivePath)).length,result.source.archiveSize);
});
test('keeps selected Git blob bytes when host core.autocrlf is enabled', async t => {
 const {root,git}=await repo(t);await writeFile(path.join(root,'.dockerignore'),'.cache\nnode_modules\n');git('add','.dockerignore');git('config','core.autocrlf','true');git('commit','-qm','add line-ending fixture');
 const outputDir=await mkdtemp(path.join(os.tmpdir(),'audit-autocrlf-out-'));t.after(()=>rm(outputDir,{recursive:true,force:true}));
 const result=await prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir});
 assert.deepEqual(await readTarMember(result.archivePath,'.dockerignore'),Buffer.from('.cache\nnode_modules\n'));
 const launcherBlob=execFileSync('git',['cat-file','blob',result.source.commit+':audit/host/launch-offline.mjs'],{cwd:root,encoding:null});
 const manifestBlob=execFileSync('git',['cat-file','blob',result.source.commit+':audit/provision/toolchain-manifest.json'],{cwd:root,encoding:null});
 assert.equal(result.trustedCode.launcherSha256,createHash('sha256').update(launcherBlob).digest('hex'));
 assert.equal(result.toolchain.manifestSha256,createHash('sha256').update(manifestBlob).digest('hex'));
 assert.equal(result.toolchain.sourceLockfileSha256,createHash('sha256').update(execFileSync('git',['cat-file','blob',result.source.commit+':package-lock.json'],{cwd:root,encoding:null})).digest('hex'));
 assert.equal(result.toolchain.lockfileSha256,'30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0');
 const runnerBlob=execFileSync('git',['cat-file','blob',result.source.commit+':audit/run/run-offline.sh'],{cwd:root,encoding:null});
 assert.equal(result.trustedCode.runnerSha256,createHash('sha256').update(runnerBlob).digest('hex'));
});
test('reads the Git archive commit marker without breaking a large archive stream', async t => {
 const {root,git}=await repo(t);await writeFile(path.join(root,'large-source.bin'),Buffer.alloc(8*1024*1024,0x41));git('add','large-source.bin');git('commit','-qm','large source');
 const outputDir=await mkdtemp(path.join(os.tmpdir(),'audit-large-out-'));t.after(()=>rm(outputDir,{recursive:true,force:true}));
 const result=await prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir});
 assert.equal(result.source.archiveCommit,result.source.commit);assert.ok(result.source.archiveSize>8*1024*1024);
});
test('refuses dirty or non-HEAD source', async t => {
 const {root,git}=await repo(t); const commit=git('rev-parse','HEAD'); await writeFile(path.join(root,'tracked.txt'),'changed');
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit,outputDir:path.join(os.tmpdir(),'unused-output')}),/clean|dirty/i);
 await writeFile(path.join(root,'tracked.txt'),'trusted source\n'); git('checkout','--','tracked.txt');
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:'0'.repeat(40),outputDir:path.join(os.tmpdir(),'unused-output')}),/HEAD|commit/i);
});
test('refuses tracked secret and cache paths', async t => {
 for(const entry of ['.env','.env.production','credentials.txt','passwords.md','passwords.ts','api/src/utils/password.ts','secrets.json','node_modules/pkg/index.js','.cache/state.bin']) {
  const {root,git}=await repo(t); const full=path.join(root,entry); await (await import('node:fs/promises')).mkdir(path.dirname(full),{recursive:true}); await writeFile(full,'sensitive');
  git('add','-f',entry); git('commit','-qm','bad path');
  await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir:path.join(os.tmpdir(),'unused-output')}),/secret|credential|cache|node_modules|unsafe|excluded/i,entry);
 }
});
test('allows only reviewed password implementation and its focused auth test paths', async t => {
 const {root,git}=await repo(t);for(const [name,content] of [['api/src/modules/auth/password.ts','export function verifyPassword() {}\n'],['api/tests/auth/password.test.ts','import { test } from \'node:test\';\ntest(\'password verifier\',()=>{});\n']]){const source=path.join(root,name);await (await import('node:fs/promises')).mkdir(path.dirname(source),{recursive:true});await writeFile(source,content);git('add',name);}git('commit','-qm','reviewed password paths');
 assert.doesNotThrow(()=>validateTrackedSourceTree(root,git('rev-parse','HEAD')));
 const extra='api/tests/credentials/password.test.ts';await (await import('node:fs/promises')).mkdir(path.dirname(path.join(root,extra)),{recursive:true});await writeFile(path.join(root,extra),'sensitive');git('add',extra);git('commit','-qm','unreviewed password test path');
 assert.throws(()=>validateTrackedSourceTree(root,git('rev-parse','HEAD')),/secret or credential path refused/i);
});
test('accepts only the sanitized root environment template', async t => {
 const actualTemplate=await readFile(new URL('../../.env.example',import.meta.url),'utf8');assert.doesNotThrow(()=>validateEnvExample(actualTemplate));
 const {root,git}=await repo(t);
 await writeFile(path.join(root,'.env.example'),SAFE_ENV_TEMPLATE); git('add','.env.example'); git('commit','-qm','sanitized template');
 assert.doesNotThrow(()=>validateTrackedSourceTree(root,git('rev-parse','HEAD')));
});
test('rejects secret-bearing or non-local root environment templates', async t => {
 for (const [name,content] of [
  ['real password',SAFE_ENV_TEMPLATE.replace('SESSION_SECRET=REPLACE_IN_LOCAL_ENV_WITH_RANDOM_VALUE','SESSION_SECRET=actual-secret-value')],
  ['non-local database',SAFE_ENV_TEMPLATE.replace('postgresql://support_dev:LOCAL_ONLY_SET_A_RANDOM_LOCAL_VALUE@localhost:5433/support_dev?schema=public','postgresql://support_dev:placeholder@db.example.test:5432/support_dev?schema=public')],
  ['unknown credential variable',SAFE_ENV_TEMPLATE+'UNREVIEWED_API_TOKEN=placeholder\n']
 ]) {
  const {root,git}=await repo(t); await writeFile(path.join(root,'.env.example'),content);
  git('add','.env.example'); git('commit','-qm','unsafe template');
  assert.throws(()=>validateTrackedSourceTree(root,git('rev-parse','HEAD')),/environment template|secret|credential|unsafe/i,name);
 }
 const {root,git}=await repo(t);await (await import('node:fs/promises')).mkdir(path.join(root,'api'),{recursive:true});await writeFile(path.join(root,'api/.env.example'),SAFE_ENV_TEMPLATE);git('add','-f','api/.env.example');git('commit','-qm','nested template');
 assert.throws(()=>validateTrackedSourceTree(root,git('rev-parse','HEAD')),/secret or credential/i,'nested environment template');
});
test('refuses symlink source entries', async t => {
 const {root,git}=await repo(t); await (await import('node:fs/promises')).symlink('tracked.txt',path.join(root,'link')); git('add','link'); git('commit','-qm','link');
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir:path.join(os.tmpdir(),'unused-output')}),/symlink|unsafe/i);
});
test('recursively refuses a nested symlink and credential path', async t => {
 const {root,git}=await repo(t); await (await import('node:fs/promises')).mkdir(path.join(root,'nested'),{recursive:true}); await (await import('node:fs/promises')).symlink('../tracked.txt',path.join(root,'nested/link')); git('add','nested/link'); git('commit','-qm','nested link');
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir:path.join(os.tmpdir(),'unused-output')}),/symlink|unsafe/i);
});
test('refuses to place the source archive inside the repository', async t => {
 const {root,git}=await repo(t); const output=path.join(root,'private-output'); await (await import('node:fs/promises')).mkdir(output);
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir:output}),/outside the source repository/i);
});
test('does not accept an arbitrary archive or stale commit claim', async t => {
 const {root,git}=await repo(t); const first=git('rev-parse','HEAD'); await writeFile(path.join(root,'tracked.txt'),'second'); git('commit','-qam','second');
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:first,outputDir:path.join(os.tmpdir(),'unused-output')}),/HEAD|commit/i);
});test('keeps ignored env, cache and unrelated untracked files out of the git archive', async t => {
 const {root,git}=await repo(t); await writeFile(path.join(root,'.gitignore'),'.env\n.cache/\nnode_modules/\n'); git('add','.gitignore'); git('commit','-qm','ignore local-only files');
 await writeFile(path.join(root,'.env'),'SECRET=must-not-archive'); await (await import('node:fs/promises')).mkdir(path.join(root,'.cache'),{recursive:true}); await writeFile(path.join(root,'.cache','host'),'cache');
 await writeFile(path.join(root,'unrelated.tmp'),'untracked'); assert.equal(git('status','--porcelain'), '?? unrelated.tmp'); await (await import('node:fs/promises')).rm(path.join(root,'unrelated.tmp'));
 const outputDir=await mkdtemp(path.join(os.tmpdir(),'audit-out-')); t.after(()=>rm(outputDir,{recursive:true,force:true})); const result=await prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir});
 const entries=execFileSync('tar',['-tf',result.archivePath],{encoding:'utf8'}); assert.doesNotMatch(entries,/^\.env$|^\.cache|^node_modules|unrelated/sm); assert.match(entries,/tracked.txt/);
});

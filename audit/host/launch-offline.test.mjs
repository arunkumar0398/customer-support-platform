import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { prepareSourceSnapshot, removePrivateInputDir, verifyLauncherLocation } from './launch-offline.mjs';
async function repo(t) {
 const root=await mkdtemp(path.join(os.tmpdir(),'audit-binding-')); t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 git('init','-q'); git('config','user.email','test@example.invalid'); git('config','user.name','test');
 await writeFile(path.join(root,'tracked.txt'),'trusted source\n'); await import('node:fs/promises').then(async fs=>{await fs.mkdir(path.join(root,'audit/provision'),{recursive:true}); await fs.writeFile(path.join(root,'audit/provision/toolchain-manifest.json'),JSON.stringify({image_id:'sha256:'+'e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3',target_lockfile_sha256:'lock',prisma_schema_sha256:'schema'}));}); git('add','.'); git('commit','-qm','source'); return {root,git};
}
test('requires the trusted launcher itself to come from the selected repository', async t => {
 const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..'); assert.match(await verifyLauncherLocation(root),/audit[\\/]host[\\/]launch-offline\.mjs$/);
 const foreign=await mkdtemp(path.join(os.tmpdir(),'foreign-audit-repo-')); t.after(()=>rm(foreign,{recursive:true,force:true}));
 await assert.rejects(verifyLauncherLocation(foreign),/selected source repository/);
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
test('refuses dirty or non-HEAD source', async t => {
 const {root,git}=await repo(t); const commit=git('rev-parse','HEAD'); await writeFile(path.join(root,'tracked.txt'),'changed');
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit,outputDir:path.join(os.tmpdir(),'unused-output')}),/clean|dirty/i);
 await writeFile(path.join(root,'tracked.txt'),'trusted source\n'); git('checkout','--','tracked.txt');
 await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:'0'.repeat(40),outputDir:path.join(os.tmpdir(),'unused-output')}),/HEAD|commit/i);
});
test('refuses tracked secret and cache paths', async t => {
 for(const entry of ['.env','credentials.txt','node_modules/pkg/index.js','.cache/state.bin']) {
  const {root,git}=await repo(t); const full=path.join(root,entry); await (await import('node:fs/promises')).mkdir(path.dirname(full),{recursive:true}); await writeFile(full,'sensitive');
  git('add','-f',entry); git('commit','-qm','bad path');
  await assert.rejects(prepareSourceSnapshot({repoRoot:root,commit:git('rev-parse','HEAD'),outputDir:path.join(os.tmpdir(),'unused-output')}),/secret|credential|cache|node_modules|unsafe|excluded/i,entry);
 }
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

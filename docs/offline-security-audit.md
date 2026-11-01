# Bounded offline security validation

## Status and evidence boundary

This package prepares and runs fixed local validation lanes under the pinned Cloudflare security-audit skill. A successful lane is not a complete six-phase audit or release clearance.

- Pinned skill: c1c8a8c1471069fb0e188eeaff69b8e8db6564a8; validators are present in the immutable image.
- Prepared image: sha256:e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3, local Docker Desktop Linux AMD64, Docker Server 29.9.2. It is local and unexported.
- Historical Run 7: candidate c79f74dd62fa11a12ac6cafe416a40c099cf9ede; application source baseline 5671f14b106ba8898b45e7e36ee4c7670d406bda; API lane source archive SHA-256 9cb30f6ae01681d9054b396707fb638d1dc942d949fab05d7aa35e7a201abcf6; 26 files / 419 tests, exit 0. The original observation says raw target output was not promoted under the required safe artifact procedure. Run 7 remains incomplete: 4 covered, 1 candidate, 9 blocked. Its validators accepted 14 coverage units and 0 findings; validator success checks structure, not coverage completion. See the external Run-7 report and observation in C:/Users/sivaa/security-audit-skill/customer-support-platform/run-7/.
- Current launcher package replaces Run-7's parent-authored capture gap. No exact-candidate lane is claimed until a clean committed candidate is passed to audit/host/launch-offline.mjs and its promoted output is verified.
- No Vercel, Neon, Preview, Production, or other hosted endpoint belongs in this audit. Preview acceptance is a separate workflow.

## Trusted source binding

The host launcher requires an explicit 40-character commit that equals HEAD in a clean worktree. It uses trusted Git commands to inspect the complete recursive tree and create git archive; dirty source is refused. Tracked secret/credential/cache/output paths, symlinks, gitlinks, and unsafe path components are refused. Ignored/untracked host files are excluded because the archive is created from the selected commit, not the working directory.

The launcher records the commit and tree IDs, object format, recursive tree path/mode/blob manifest and digest, Git archive commit marker, archive SHA-256/size, pinned image/lock/schema/manifest digests, launcher and runner hashes, and safe execution settings. The Linux verifier checks the Git archive marker and compares every archive regular-file path, blob object ID, mode, and count with the selected Git tree manifest. An archive with a copied commit marker but altered content is rejected. Input archives and records are read-only to target code.

Run only after all intended source and documentation changes are committed:

    $repo = (Resolve-Path .).Path
    $sha = & 'C:\Program Files\Git\cmd\git.exe' -C $repo rev-parse HEAD
    & node audit/host/launch-offline.mjs --execute --repo $repo --commit $sha --lane api --evidence-dir C:\Users\sivaa\security-audit-skill\customer-support-platform\run-8 --timeout 5400

Use a new empty evidence root per run; the launcher creates a unique child directory. It refuses a dirty/non-HEAD source, a non-local Docker engine, non-Linux/non-AMD64 server, unexpected image digest, existing output collision, or unsupported lane. The record contains the sanitized host Docker context/server, host OS/architecture, actual target/helper argument arrays (with only the self-referential launch-record hash represented by an explicit placeholder), mounts, UID/capabilities, environment allowlist, resource ceilings, timeout, volume/container names, and helper limits. Do not put credentials or database URLs in the evidence record.

## Isolation and artifact promotion

The parent creates distinct bounded tmpfs volumes. A trusted Linux promotion helper starts first, opens directory descriptors for scratch and artifact roots with no-follow flags, and waits. The target runs with --pull=never --network=none --read-only --user 10001:10001 --cap-drop=ALL --security-opt=no-new-privileges, 1 CPU, 1536 MiB memory, zero swap, 256 PIDs, 1 GiB file-size limit, 1.1 GiB scratch and a maximum 90-minute timeout. Only the committed source archive and runner copies are mounted read-only; target has no artifact mount, Docker socket, host home, cache, or external output path. Only explicit allowlisted environment variables are supplied. The preflight checks mount modes, network routes/interfaces, proxy absence, versions, UID, cgroups, swap, PID/file/disk limits, safe dummy DB URLs, and all source/toolchain hashes before target-controlled tests begin.

After the target exits, the parent confirms Docker state is stopped and removes the target container. Only then does it ask the helper to promote the fixed bounded allowlist preflight.out, lane.log, and lane-result.json. Promotion uses descriptor-relative no-follow file opens, rejects traversal/special files/symlinks/hard links, verifies regular-file identity and link count before/after bounded reads, detects file changes and size growth, writes into a fresh private staging directory, and atomically renames it. The parent copies only those exact promoted files and checks their hashes. It never recursively copies target scratch. On uncertainty, it keeps named Docker volumes and writes a recovery record; reconcile those exact objects before retrying. The target cannot access the artifact volume or Docker socket.

Host output is retained under the external evidence root, not in the source tree. Sanitize before sharing. Do not promote screenshots, credentials, environment files, browser profiles, arbitrary logs, or unallowlisted files. The helper's unit tests cover symlink, hard-link, FIFO/directory/socket, traversal, oversized and changing files, duplicate/overwrite refusal, and file-set bounds; source-verifier tests cover forged archive payloads with a claimed commit marker and launch-configuration tampering.

## Fixed lane commands

The launcher supports only api, web, browser, browser-smoke, and all; there is no arbitrary command string. The API lane runs disposable PostgreSQL migrations and npm run test:api; Web runs the Web suite; browser runs the local synthetic browser suite; all additionally runs lint, typecheck, build, and browser discovery/execution. Each lane starts local loopback-only dummy PostgreSQL inside the target sandbox. No dependencies are installed or fetched during audit execution.

Use one lane per evidence record where an invariant needs a distinct result. A successful API lane proves only the assertions actually present in that exact source and run. Map each audit coverage unit to a specific assertion and evidence type; do not mark a unit covered because an aggregate command exited zero.

## Existing scoped evidence to reuse

- API: Run-7 scoped result as recorded above; it is not formal retained output and is historical to its exact candidate/source archive.
- Query plans (A38): docs/performance.md records a rollback-only 50,000-row synthetic PostgreSQL assessment with first page, deep page, status filter, count and substring search plans. It is scoped historical evidence; verify the indexed query/schema files are unchanged before carrying it forward. It is not load or production latency evidence.
- Recovery (A36): evidence/checkpoints/A36-migration-recovery-2026-11-01.md records a disposable PostgreSQL logical backup restore, forward migration check, and prior-code compatibility. Current three migrations/schema must be compared before reuse. It is not SQL down migration or hosted PITR.
- UI/Hallmark: evidence/checkpoints/UI_A22_A23_MATRIX_2026-11-01.md and the linked Hallmark reports describe measured sign-in contrast/focus and scoped journeys. Current web changes must be compared to that candidate. A22/A23/A37 are partial, and manual screen-reader review is not performed by an automated lane.

## Incomplete audit requirements

Run 7 remains incomplete and needs a fresh coverage ledger/report on the selected candidate. Remaining local lanes include the throttle capacity test, session/CSRF and revocation mapping, object/child/dashboard authorization, membership mutation and concurrency, transaction rollback/stale versions, query-plan scope confirmation, API proxy stub boundaries, supply-chain/workflow review, and finite client/UI states. The throttle test is local process behavior only; it cannot establish Vercel multi-instance or deployed behavior. Do not label that as confirmed vulnerability solely from the map-capacity policy. Independently verify any retained candidate and use both pinned validators on the new run's ledger/findings. A reviewer must separately state whether its review is independent and name the exact source SHA.

Full audit status remains INCOMPLETE until all applicable phases/coverage have a defensible disposition, findings and coverage validators pass, retained findings are independently verified, and the report states exact SHA, methods, commands, exit codes, environment, artifacts and limits. If an execution control is not demonstrable, stop the affected lane and record its exact blocker.

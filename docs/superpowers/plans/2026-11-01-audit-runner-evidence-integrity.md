# Audit Runner Source Binding and Evidence Promotion Implementation Plan

> **For agentic workers:** execute task-by-task using the TDD loop. Keep all changes on the isolated branch. Do not push or use hosted services.

**Goal:** bind each offline lane to a clean Git commit and safely retain bounded output through a Linux parent-owned promotion helper.

**Architecture:** a Node host launcher creates a verified git archive from an explicit clean HEAD and records immutable provenance and the exact Docker controls. A Linux helper holds open directory descriptors across execution, then promotes only named output files after the target container exits. The toolchain image remains immutable; the committed runner scripts are mounted read-only from the committed candidate.

**Tech Stack:** Node.js built-ins (node:test, node:crypto, child_process); Python 3 standard library (unittest, os.open, dir_fd, O_NOFOLLOW); Docker CLI/Engine; existing immutable audit image.

**Spec:** docs/superpowers/specs/2026-11-01-audit-runner-evidence-integrity.md

## Global Constraints

- Start at c79f74dd62fa11a12ac6cafe416a40c099cf9ede; never reset or modify dirty checkouts or their 12 screenshots.
- Work on codex/audit-evidence-integrity-c79; no push without new approval.
- Audit image is sha256:e988f93c6d977ddcd3ca5f2d8814a6c1cbf53c18640da496c0fadea76a1d9ba3; no pull/install/fetch during audit execution.
- The target gets no artifact destination, Docker socket, credentials, or external network.
- Target execution: Linux no-network; read-only root/source/toolchain; 1 CPU, 1536 MiB memory, swap disabled, 256 PIDs, 1 GiB file size, 1100 MiB scratch, outer maximum 90 minutes.
- Keep app source changes out of scope. Keep assessment optional deployment/CI separate from internal security release gates.

## Review Focus

- Dirty/untracked/ignored credentials cannot enter the archive; reject tracked secrets and require clean Git state.
- A forged or stale SHA cannot bind an arbitrary archive; require Git archive commit marker and exact tree identity.
- A target-created symlink, hard link, FIFO, device, directory, traversal path, over-limit file, or changing inode cannot be promoted.
- A target cannot access or alter the parent artifact volume or Docker control socket.
- An interrupted/failed target cannot leave unverified data represented as a successful run.

---

### Task 1: Implement and test source snapshot binding

**Files:** create audit/host/launch-offline.mjs, create audit/host/launch-offline.test.mjs, modify audit/provision/toolchain-manifest.json only after hash verification.

- [ ] RED: tests create temporary Git repositories and assert successful archive binding for clean exact HEAD.
- [ ] RED: assert dirty tree, wrong commit, tracked .env, credential suffix, node_modules/cache, gitlink/submodule, and symlink tree are refused.
- [ ] RED: archive from commit A with expected commit B is refused by git get-tar-commit-id.
- [ ] Run focused tests in the pinned Linux image with no network and scratch-only writes; observe intended failures before implementation.
- [ ] GREEN: implement prepareSourceSnapshot(repoRoot, commit, scratchRoot) and Git subprocess helpers without shell interpolation. Return commit, tree ID, archive SHA, launcher/promotion hashes, toolchain digest, safe-config record.
- [ ] Verify focused tests pass; add no dependency.

**Pass evidence:** exact commands, exit codes, archive commit marker, tree ID, SHA-256, and refusal cases.

### Task 2: Implement Linux no-follow artifact promotion

**Files:** create audit/run/promote_artifacts.py and audit/run/test_promote_artifacts.py.

- [ ] RED: reject absolute/traversal/empty/dot paths, symlinks, hard links, FIFOs/devices/directories, per-file/cumulative oversize, and a file whose content or metadata changes while read.
- [ ] RED: prove a rejected promotion publishes no final run directory and leaves unrelated files untouched.
- [ ] Run python3 -m unittest focused tests in the pinned Linux image.
- [ ] GREEN: implement retained root dirfds; component-by-component openat semantics with O_NOFOLLOW|O_DIRECTORY; nonblocking leaf open; fstat regular/single-link/size checks before and after bounded reads; path identity recheck; exclusive destination creation; atomic run-directory rename; cumulative byte limit.
- [ ] Implement --serve mode that opens descriptors and reports ready before target start, receives one bounded JSON request after target exit, promotes allowlisted files, and never exposes artifact mount to target.
- [ ] Verify all adversarial tests pass on Linux and confirm the helper refuses non-Linux platforms.

**Pass evidence:** adversarial test output, exact limits, helper SHA, and proof the target container has no artifact mount/socket.

### Task 3: Bind the fixed lanes to the verified archive and retain output

**Files:** modify audit/run/preflight.sh and audit/run/run-offline.sh; modify audit/provision/toolchain-manifest.json and docs/offline-security-audit.md.

- [ ] RED: preflight rejects missing/mismatched source SHA, Git archive commit marker, archive hash, tree ID, launch record, lock/schema hashes, unsafe environment, and changed runner hashes.
- [ ] GREEN: preflight verifies the input mount read-only, pinned allowlisted env, exact image/lock/schema/tool versions and sandbox limits. Runner checks Git archive commit ID and archive SHA before safe extraction, verifies source hashes, then runs only fixed lanes.
- [ ] Capture preflight and lane log to bounded scratch files; no arbitrary command or path is accepted.
- [ ] Implement launcher order: create volumes/verified archive; start promotion helper and wait for ready; start target with no artifact/socket mount; enforce 90-minute wall time; inspect and remove stopped target; only then request promotion; export exact files and verify output hashes.
- [ ] Test source/runner changes against c79 using the pinned image, followed by the single API lane on the final clean commit.

**Pass evidence:** exact launcher record, preflight output, API output promoted after shutdown, exit code, and validator results on the new run directory.

### Task 4: Throttle capacity and audit disposition

**Files:** create/update only focused auth test and audit evidence files if the actual behavior warrants; no production limits changed.

- [ ] Inspect throttle implementation and use a fresh real app/limiter instance plus deterministic clock and dummy principals.
- [ ] Test existing key at capacity, new key with 4096 live entries, expiration/prune/recovery, account/IP counters separately, and fresh process restart. Avoid password KDF calls by reaching the actual middleware boundary.
- [ ] Run against the approved offline container with bounded runtime.
- [ ] Send the candidate and exact new test evidence to a fresh independent verifier; record confirmed, rejected, or needs_validation with only observed claims. Do not infer Vercel behavior.

**Pass evidence:** independent exact-schema verdict or explicit budget/environment blocker.

### Task 5: Final review and assessment disposition

**Files:** run-8 artifacts outside the repo; if code is changed, update only directly affected acceptance/documentation in the same substantive package.

- [ ] Run both official validators after the final ledger/finding edits.
- [ ] Use the actual 100xdevs reviewer skill as a read-only implementation review; explicitly state independence limits.
- [ ] Re-run local query plans, disposable recovery, local proxy stub, offline UI/browser matrix only where current evidence is missing; preserve historical Hallmark evidence scope.
- [ ] Prepare the sanitized Preview approval package with exact provider/deployment/run fields. If unavailable, report the specific missing values; perform no hosted writes or probes.
- [ ] Check eight assessment deliverables and record separate internal release blockers. Deployment and CI are optional under PDF Section 8.
- [ ] Request G7 only after evidence is reconciled and independently reviewed.

**Pass evidence:** exact source/candidate SHA, changed paths, command results, audit coverage, Preview approval field status, eight-item inventory, and no push/deploy.


### Post-plan corrections from implementation inspection

- The actual source-verification helper is audit/run/verify_input.py; it validates the tree/blob/mode manifest, runner digests, image/lock/schema pins, execution config and archive payload.
- Artifact helper file name is audit/run/promote_artifacts.py.
- Host launcher is audit/host/launch-offline.mjs and writes the parent-controlled execution record and bounded output bundle outside the repository.
- Implementation tests currently cover recursive paths, exact source binding, parent-only promotion, adversarial file types/races/limits and launch-record controls. Exact-candidate execution remains pending until the package is committed on a clean tree.

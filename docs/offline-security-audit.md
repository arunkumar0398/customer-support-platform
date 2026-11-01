# Offline Security Audit Toolchain

This package prepares an immutable Linux toolchain for the bounded Cloudflare security-audit workflow. It does **not** run that audit, certify the host's isolation, or close any security acceptance item. The audit remains `NOT_RUN` until an approved runner passes the controls below and the workflow reaches one of its defined terminal states.

## Separation of provisioning and audit

Image preparation is the only network-enabled phase. It pins the Node base image by digest, installs the repository lockfile once, installs the matching Playwright Chromium browser, installs PostgreSQL tooling, and vendors the official Cloudflare audit skill and validators at the pinned commit recorded in `audit/provision/toolchain-manifest.json`. Prisma generation runs only after preflight, from the exact scratch source copy, with the preinstalled Prisma CLI. Image preparation must record the final local image ID, platform, installed PostgreSQL server/client versions, and source hashes in that manifest.

Audit execution must use the resulting image by immutable image ID, with `--pull=never`; it must not run npm installation, `npx`, a package manager, browser installation, or another fetch. The source candidate is mounted read-only at `/target`. A trusted runner may make a clean archive of the exact Git commit in its private scratch area; target-controlled commands run only from that scratch copy, which is the only writable target area. Toolchain and skill files stay on the image's read-only root.

## Required execution controls

Use a Linux runner whose container isolation and cgroups are enabled and independently observable. Start the audit container with:

- `--network=none` (loopback only);
- `--read-only` and `--mount type=bind,source=<candidate>,target=/target,readonly`;
- one bounded tmpfs at `/scratch` (maximum 1.1 GiB; no host home, socket, cache, or retained output mount);
- `--user 10001:10001`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`;
- explicit CPU, memory, swap, and PID ceilings (`1 CPU`, `1536 MiB`, no swap allowance, `128 PIDs`; Docker uses `--memory-swap` equal to `--memory`, which the cgroup reports as `memory.swap.max=0`);
- a finite file-size ulimit and an outer wall-clock timeout (maximum 90 minutes per lane);
- explicit `--env` values only for safe `PATH`, `HOME`, `TMPDIR`, `CI`, `NODE_ENV`, `AUDIT_SOURCE_SHA`, `AUDIT_LOCK_SHA256`, and dummy loopback database values where required. The image and Docker add a small set of expected runtime variables which the preflight allowlist accepts. Never pass host variables with bare `-e`.

Run `/opt/audit-runner/preflight.sh` before any target-controlled build, test, server, browser, or fixture command. It checks the container-visible controls, tool versions, pinned lockfile, and absence of external routes and proxy variables. Capture the `docker run` arguments and the preflight output. If a control is absent or cannot be demonstrated, stop; record the missing capability as `needs_validation` and do not execute target code.

The package's `run-offline.sh` accepts only fixed lanes (`api`, `web`, `browser`, `all`) and rejects arbitrary command strings. It runs the preflight and requires its exit code to be zero before touching the source archive, then checks the exact candidate copy in `/scratch/source`. The current `all` lane is a convenience for local checks; it is not itself the six-phase Cloudflare audit or proof of audit completion.

## Build and record the bundle

From the repository root, after reviewing the lockfile and package inputs:

```sh
docker build --pull --platform linux/amd64 -f audit/provision/Dockerfile -t csp-offline-audit:ddf3d69 .
docker image inspect csp-offline-audit:ddf3d69 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

Record the returned immutable image ID and actual PostgreSQL server/client versions in the manifest. Use the image ID (not the mutable tag) for all later runs. Keep any exported image archive and its SHA-256 outside the repository; do not commit it. The current local bundle is `sha256:dd0936da81c2bf37973a481266bff97ae97d6af0f2a44486b2cadc81734435af`; it has not been exported or independently attested.

The build context honors the repository `.dockerignore`, which excludes `evidence/`, screenshots, test results, credentials, and local `node_modules/`. The Dockerfile copies package manifests, the lockfile, and the two runner scripts needed to prepare the image. Candidate source, including Prisma schema/config, is supplied later through the read-only `/target` mount and copied from an exact Git archive into scratch.

## Run a preflight-only control check

Use an empty scratch directory outside the target, a clean candidate worktree at the exact SHA, and the immutable local image ID. The runner must not mount the Docker socket inside the container. Example control invocation (adapt only host paths and recorded SHA):

```sh
timeout --signal=TERM --kill-after=10s 5m docker run --rm --pull=never \
  --network=none --read-only --user 10001:10001 --cap-drop=ALL \
  --security-opt=no-new-privileges --cpus=1 --memory=1536m --memory-swap=1536m \
  --pids-limit=128 --ulimit fsize=1048576:1048576 \
  --tmpfs /scratch:rw,nosuid,nodev,size=1100m,mode=0700,uid=10001,gid=10001 \
  --mount type=bind,source="$PWD",target=/target,readonly \
  --env PATH=/opt/toolchain/project/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --env HOME=/scratch/home --env TMPDIR=/scratch/tmp --env CI=1 --env NODE_ENV=test \
  --env AUDIT_SOURCE_SHA=<40-hex-commit> \
  --env AUDIT_LOCK_SHA256=30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0 \
  <immutable-image-id>
```

This invocation is only a control preflight. A separate recorded run is required for each test lane. It must run against a clean checkout whose `git rev-parse HEAD` equals `AUDIT_SOURCE_SHA`; modified screenshot files in another checkout must never be included in the source archive. The original linked Windows worktree could not provide Git metadata to the Linux container, so I created a clean shallow clone of the approved remote branch at `ddf3d69b32db494e04ae36256633633bf9132583` inside the workspace and mounted that clone read-only. The latest run verified its exact Git HEAD as well as container controls, tools, lockfile and schema. It did not run target tests. Do not send audit traffic to Preview, Production, Vercel, Neon, or any shared service.

The latest preflight-only run exited `0` on 2026-11-01 with the manifest image ID and a clean checkout at `ddf3d69b32db494e04ae36256633633bf9132583`. It used `--network=none`, `--read-only`, uid `10001:10001`, dropped capabilities, `no-new-privileges`, 1 CPU, 1536 MiB memory, swap disabled, 128 PIDs, a 1 GiB file-size ceiling, a 1100 MiB `/scratch` tmpfs, and a read-only bind mount for `/target`. It passed exact Git HEAD, tool versions, the pinned skill commit, lockfile/schema hashes, mount modes, loopback-only interface, and cgroup checks. Separate refusal checks rejected `UNSAFE_TEST` with exit `1` and an unsupported lane with exit `2`. A read-only source-file mount check reported `ro,nosuid,nodev,relatime,ignore_atime,no_xattr`. These checks did not execute application tests.

## Run one bounded offline lane

The candidate archive is produced by Git from the committed tree, not by archiving the working directory. Keep the archive in a private host scratch directory outside the repository. The following Linux example runs the API lane. Select the image by the recorded immutable image ID and substitute the actual candidate SHA and image ID from the manifest/run record:

```sh
set -eu
CANDIDATE="$PWD"
SOURCE_SHA="$(git -C "$CANDIDATE" rev-parse HEAD)"
test -z "$(git -C "$CANDIDATE" status --porcelain)"
AUDIT_SCRATCH="$(mktemp -d)"
chmod 700 "$AUDIT_SCRATCH"
git -C "$CANDIDATE" archive --format=tar --output="$AUDIT_SCRATCH/source.tar" "$SOURCE_SHA"
ARCHIVE_SHA="$(sha256sum "$AUDIT_SCRATCH/source.tar" | awk '{print $1}')"
IMAGE_ID='sha256:REPLACE_WITH_RECORDED_IMAGE_ID'

timeout --signal=TERM --kill-after=10s 90m docker run --name "csp-audit-${SOURCE_SHA:0:12}" \
  --pull=never --entrypoint /opt/audit-runner/run-offline.sh \
  --network=none --read-only --user 10001:10001 --cap-drop=ALL \
  --security-opt=no-new-privileges --cpus=1 --memory=1536m --memory-swap=1536m \
  --pids-limit=128 --ulimit fsize=1048576:1048576 \
  --tmpfs /scratch:rw,nosuid,nodev,size=1100m,mode=0700,uid=10001,gid=10001 \
  --mount "type=bind,source=$CANDIDATE,target=/target,readonly" \
  --mount "type=bind,source=$AUDIT_SCRATCH/source.tar,target=/input/source.tar,readonly" \
  --env PATH=/opt/toolchain/project/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --env HOME=/scratch/home --env TMPDIR=/scratch/tmp --env CI=1 --env NODE_ENV=test \
  --env AUDIT_SOURCE_SHA="$SOURCE_SHA" \
  --env AUDIT_ARCHIVE_SHA256="$ARCHIVE_SHA" \
  --env AUDIT_LOCK_SHA256=30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0 \
  "$IMAGE_ID" api
```

The fixed runner accepts only `api`, `web`, `browser`, or `all`; it refuses arbitrary commands, a non-empty `/scratch`, source/archive hash mismatch, and a candidate HEAD mismatch. Capture the exact command, container output and exit code. If artifacts must be retained, first review them in the isolated parent context and promote only bounded, sanitized files using the Cloudflare skill's write-isolation procedure. Do not mount a host output directory or Docker socket into the audit container. Remove the stopped named container and private source archive only after recording the evidence and confirming artifact promotion; do not use broad Docker prune commands.

The `all` lane runs the repository check plus browser suite, but it is only a convenience test lane. It does not itself perform the Cloudflare six-phase audit, validate findings/coverage artifacts, or establish audit completion.

## Evidence required before an audit result

Record the candidate SHA and dirty state, lockfile and schema hashes, image ID/provenance, Linux kernel and architecture, Docker/cgroup versions, exact container flags, safe environment-variable names, preflight output, and lane command/exit code. Use dummy identities and loopback-only local services. Keep outputs in a new audit run directory outside the target and use the Cloudflare skill's parent-only artifact promotion procedure before retaining bounded results.

The report must distinguish `confirmed`, `needs_validation`, `rejected`, `deferred`, and `out_of_scope` coverage, and must keep deployed throttle behavior unresolved unless supported by permitted owner-side configuration evidence. Never treat a toolchain build or successful preflight as a security audit.

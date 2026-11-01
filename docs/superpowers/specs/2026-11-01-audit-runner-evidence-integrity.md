# Audit source binding and bounded evidence design

**Status:** implementation design for the local audit runner only. It does not change the customer-support application or authorize hosted activity.

## Context

The current runner accepts an archive digest and a claimed commit SHA as separate inputs. It verifies the digest inside the sandbox but does not prove that the archive was created from that commit. The Windows primary checkout is dirty; a clean detached C79 clone exists and is used as the starting source. The Cloudflare skill requires Linux descriptor-relative no-follow artifact promotion after every target process has terminated.

## Chosen design

Use a host-side Node launcher as the source-of-truth selector. It requires an explicit full commit equal to HEAD and an entirely clean checkout, rejects tracked secret/cache/generated paths, creates the archive using git archive, reads the Git archive commit marker using git get-tar-commit-id, computes the Git tree ID and archive SHA-256, and records the launcher, promoter, toolchain image digest, and fixed container controls. It mounts only the verified archive, launch record, and exact committed runner scripts into the child.

A Linux promotion helper starts before target execution and retains directory descriptors to a bounded tmpfs-backed scratch volume and a separate parent-only artifact volume. The target gets the scratch volume and read-only input volume; it never gets the artifact volume, Docker socket, host home, or output directory. After Docker confirms the target container has exited and it is removed, the helper promotes only allowlisted regular files using descriptor-relative no-follow traversal, link/size/identity checks, exclusive destinations, and an atomic per-run directory publish.

The current Windows host delegates descriptor operations to a Linux container running on its Docker Desktop Linux engine. A capability probe confirmed that a trusted Linux container can access the local Docker Engine socket. The socket is passed only to the host-controlled launcher/promotion process; it is never mounted in the target container.

## Boundaries

- No network, database, deployment, or application behavior changes.
- No package installation or fetching during target runs.
- Target archive content is untrusted; only the pinned toolchain and reviewed parent helpers are trusted.
- A bounded test result is not a Cloudflare audit completion, Preview acceptance, or G7 verdict.
- The launcher must refuse dirty state, non-HEAD commit, tracked .env/credential files, submodules, symlinks, unsupported lanes, and archive/commit mismatch.
- Audit output remains external to the repository and uses a new run directory for the descendant candidate.

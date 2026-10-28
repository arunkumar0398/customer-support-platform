# TK-33 checkpoint review — Docker VMM attempt

Date: 2026-10-28
Review mode: checkpoint-review (C5/TK-33, runtime blocker scope)
Repository: D:/__superset/cactro-tests/_react-node-apps/customer-support-platform/customer-support-platform
HEAD reviewed: 6f8bc4715ca6420213066ed3a0caf769abf8b42a
Branch: codex/assessment-mvp
Environment: Windows 11 Home Single Language, build 22000; Docker Desktop 4.97.0 per-user; Docker VMM backend; Linux engine 29.9.2/kernel 7.0.14-linuxkit
Independence: performed sequentially in the primary task context using the parent-folder reviewer kit. No separate reviewer checkout or independent reviewer agent was used; this limits reviewer independence. Existing exact-SHA TK-33 code reviews are cited in the checkpoint.

## Verdict and gates

Verdict: BLOCKED_BY_ENVIRONMENT.

- TK-33: IN_PROGRESS.
- A24: BLOCKED for this attempt; Compose config passes but image build/pull and service startup are not proven.
- G5: NOT_RUN. Docker runtime, clean checkout, hosted CI and complete release gates remain outstanding.
- G6/G7: NOT_RUN; deployment remains unauthorized and no deployment was attempted.

## Findings

### ENV-1 — Docker VMM cannot resolve the public registry

Severity: P1 environment blocker; confidence: VERIFIED. This is not evidence of a project-code defect.

Observed: docker compose build api web failed when fetching the pinned node and nginx base manifests. The VMM log reports a direct connection because no HTTPS proxy is configured, then lookup of registry-1.docker.io fails with no such host. docker image pull alpine:3.22 reproduced the same error. On the Windows host, nslookup resolved registry-1.docker.io and curl to its v2 endpoint returned HTTP 401. Compose config validates, but no images, containers, or volumes were created.

Impacted: A24; G5.

Smallest next action: resolve Docker VMM outbound DNS/proxy on this host, then repeat a public image pull, image build and fresh Compose startup. Keep A24 NOT_RUN until those runtime checks pass.

### ENV-2 — Host and VMM memory are below documented support targets

Severity: P2 environment constraint; confidence: VERIFIED.

Observed: Windows build is 22000, below Docker's published Windows 11 minimum of 23H2/build 22631. Docker info reports 2 GiB VMM memory, while Docker VMM documentation requires at least 4 GiB. The engine starts, but the host configuration is outside the documented support baseline.

Impacted: reliability of A24 and G5.

Smallest next action: use a supported Windows build and allocate at least 4 GiB to VMM before treating this as a reproducible local Docker environment.

### ENV-3 — First build attempt lacked credential helper PATH

Severity: P2 resolved workaround; confidence: VERIFIED.

Observed: the first build attempt could not find docker-credential-desktop.exe because the Codex-launched child PATH omitted Docker's resource directory. A temporary config without credsStore and explicit Docker context was used to retry anonymously. The later failure was DNS, not credential helper resolution. User Docker credential settings were not changed.

## Evidence

| Requirement / gate | Probe | Result |
|---|---|---|
| A24 / TK-33 | docker desktop status | PASS: running on VMM |
| A24 / TK-33 | docker info | PASS: actual Linux engine, kernel 7.0.14-linuxkit |
| A24 / TK-33 | docker compose config -q | PASS, exit 0 |
| A24 / TK-33 | docker compose build api web | BLOCKED: registry DNS inside VMM |
| A24 / TK-33 | docker image pull alpine:3.22 | BLOCKED: same registry DNS failure |
| A24 / TK-33 | Windows nslookup and curl to registry | PASS: DNS resolves; endpoint returns expected 401 |
| A24 / TK-33 | docker image/ps/volume listings | PASS: no images, containers or volumes created |
| G5 | full release gate | NOT_RUN |

The Docker 4.97 installer SHA-256 matched Docker's published checksum and Authenticode status was Valid for Docker Inc. Official references: [Windows install requirements](https://docs.docker.com/desktop/setup/install/windows-install/), [Docker VMM](https://docs.docker.com/desktop/features/vmm/), [Docker networking](https://docs.docker.com/desktop/features/networking/).

## Coverage gaps and unsupported claims

- The API and web images have not built. PostgreSQL Compose startup, migrations, seed, API/web health checks, browser-over-Compose, and fresh-checkout Docker behavior remain unverified.
- Previous Docker-independent checks remain scoped to the source SHA recorded in TK-33; they are not Docker runtime evidence.
- This review does not claim the project is release-ready or that WSL was repaired. Docker VMM works as a running engine, while its outbound registry path does not.

## Next smallest builder action

Resolve VMM DNS/proxy and memory/support baseline, then rerun docker image pull and docker compose build api web. If those pass, run the documented fresh Compose database, migration, seed, API, and web health sequence; update A24 only from observed evidence.
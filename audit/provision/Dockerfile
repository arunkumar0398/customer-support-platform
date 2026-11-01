# syntax=docker/dockerfile:1
# Toolchain preparation is a separate, network-enabled provisioning step.
# Audit execution itself uses this immutable image with --network=none.
FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c

ARG CLOUDFLARE_AUDIT_REF=c1c8a8c1471069fb0e188eeaff69b8e8db6564a8
ARG EXPECTED_PACKAGE_LOCK_SHA256=30af23e771a28483818648dc61d293d9ada6ad6ef720a24d729ef8451a83cae0

ENV PATH=/opt/toolchain/project/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       bash ca-certificates coreutils curl findutils git iproute2 postgresql \
       python3 procps util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global npm@11.19.1 \
    && groupadd --gid 10001 audit \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin audit

WORKDIR /opt/toolchain/project
COPY package.json package-lock.json .npmrc .nvmrc ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json

# Resolve the repository lockfile once during bundle preparation. The audit
# runner never invokes npm install, npm ci, npx, or another network resolver.
RUN echo "${EXPECTED_PACKAGE_LOCK_SHA256}  package-lock.json" | sha256sum --check - \
    && npm ci --ignore-scripts --include=dev \
    && npm rebuild esbuild

# Install the browser version pinned by package-lock.json and its Linux runtime
# libraries while preparing the image, not during an audit run.
RUN PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers ./node_modules/.bin/playwright install --with-deps chromium

# Prisma's engine install script is enabled explicitly during toolchain
# preparation; it is never invoked by the offline audit runner.
RUN npm rebuild @prisma/engines && prisma --version

# Vendor the official audit instructions and validators at an immutable commit.
RUN git init /opt/cloudflare-security-audit-skill \
    && git -C /opt/cloudflare-security-audit-skill remote add origin https://github.com/cloudflare/security-audit-skill.git \
    && git -C /opt/cloudflare-security-audit-skill fetch --depth 1 origin "${CLOUDFLARE_AUDIT_REF}" \
    && git -C /opt/cloudflare-security-audit-skill checkout --detach FETCH_HEAD \
    && test "$(git -C /opt/cloudflare-security-audit-skill rev-parse HEAD)" = "${CLOUDFLARE_AUDIT_REF}"

COPY audit/run/preflight.sh /opt/audit-runner/preflight.sh
COPY audit/run/run-offline.sh /opt/audit-runner/run-offline.sh
RUN bash -n /opt/audit-runner/preflight.sh /opt/audit-runner/run-offline.sh \
    && chmod 0555 /opt/audit-runner/preflight.sh /opt/audit-runner/run-offline.sh

LABEL org.opencontainers.image.title="customer-support-platform offline security audit toolchain" \
      org.opencontainers.image.source="https://github.com/arunkumar0398/customer-support-platform" \
      org.opencontainers.image.description="Preinstalled, lockfile-pinned audit tools; runtime execution must use the documented no-network sandbox"

WORKDIR /scratch
RUN mkdir -p /input && chmod 0555 /input
ENTRYPOINT ["/opt/audit-runner/preflight.sh"]

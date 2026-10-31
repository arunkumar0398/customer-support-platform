# Official validator results

Both official validators passed inside Docker using node:24-alpine, network disabled, read-only root filesystem, read-only mounts for the trusted skill checkout and parent-created audit output, memory limit 256 MiB, CPU quota 0.5, and process limit 32.

- validate-coverage-ledger.cjs: PASS, 6 coverage units valid.
- validate-findings.cjs: PASS, 1 finding valid.

The first Windows-host invocations were blocked because no-follow/nonblocking protection was unavailable; that was resolved by running the trusted validators inside the isolated Linux container.

GitHub Actions run #37 passed on audited repo head 00731039fd1830c4acd7faa2132b3afe27062314; this is CI, not the Cloudflare audit.

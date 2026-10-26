# PDF Requirements → Acceptance IDs → Deliverables

**Authority:** `reference/assessment.pdf`. Each PDF section is summarized below, not replaced by the plan. Execution must maintain a status per acceptance ID in `evidence/checkpoints/acceptance-status.md` once work begins.

| PDF page / section | Requirement (source) | Proposed implementation and evidence | Acceptance IDs |
|---|---|---|---|
| p1 §2 | Admin, agent, customer, precise permissions | Role matrix, membership API, owner and cross-org checks | A03,A06,A08,A09,A10,A12 |
| p1 §3 | Secure auth and tenant isolation | Opaque cookie session, authoritative membership, negative API tests | A01–A09,A31–A33 |
| p1 §3 | Ticket lifecycle and assignments | Valid transitions, priority and tenant-safe assignee, atomic audit | A10–A16,A29 |
| p1 §3 | Paginated ticket discovery, search/filter/sort | Tenant-first indexed queries, tie-break sorting and limits | A17–A19,A38 |
| p1 §3 | Conversation + meaningful change history | Comments and append-only events in ticket transaction | A14–A16 |
| p1 §3 | Counts/status/priority/overdue/workload | Published metric definitions and DB fixture assertions | A20,A21 |
| p1 §3 | Notifications design; implementation stretch | Explicit durable design/tradeoff doc; no required sender | A39 |
| p1 §4 | Responsive React, main pages, accessibility and states | Playwright desktop/mobile, validation/loading/denied/conflict | A22,A23,A37 |
| p2 §5 | Node.js API with documented endpoints | Express, Zod allowlists, HTTP codes, request IDs and API docs | A11,A12,A26,A31–A33 |
| p2 §5 | Duplicate requests, concurrency, failed external integration | Design notes, versioned PATCH, replay/compensation options | A29,A30,A36 |
| p2 §6 | PostgreSQL/MongoDB choice, entity design, relationships | Prisma PostgreSQL, indexes/FK, tenant scope | A09,A15,A16,A25,A38 |
| p2 §6 | Millions of tickets, pagination, two-org seed, isolation verification | Seed + multi-org negative suite + EXPLAIN analysis | A04–A07,A17–A19,A24,A25,A38 |
| p2 §7 | Hosting, TLS, secrets, backups, CI/CD, alerting, cost, scaling | Vercel/Neon topology and AWS alternative; operational doc | A27,A28,A34,A36 |
| p2 §8 | Working vertical slice + local Docker, tests | C0–C5 implementation, clean checkout CI, demo | A01–A28 |
| p2 §8 | 8 required submission deliverables | README, diagrams, schema, API, seed, tests, limitations, Git URL | A26 |
| p2 §8 | Optional live deploy, CI, notifications/attachments | Deploy only after approved local MVP; optional honest gaps | A34–A36,A39,A40 |
| p2 §9 | 60–90m design/reliability/security discussion | Demonstration and independent assessment reviewer | A28 |
| p2–3 §10 | AI assistants allowed with explanation and accurate self-disclosure | `AI_USAGE.md`, provenance and replayed evidence | A26,A28 |

## Scope interpretation
**MVP blocking:** secure login, organization-aware server authorization, ticket create/list/filter/detail/update, persistent DB, minimal dashboard, tests, Docker, docs and explicit assumptions. **Review-strengthening:** memberships UI, comments/history, safe concurrent updates, cookie hardening and CI; prioritize highly because the PDF calls these out even if the working vertical-slice definition is narrower. **Optional:** live Vercel + Neon deployment, notifications sender, attachments, advanced metrics, full observability dashboard. The project aims to deploy after MVP but does not invent an external submission deadline.

## Gap resolution discipline
Before coding, map each A01–A40 to an executable test path, or mark `DESIGN_ONLY/OPTIONAL_NOT_IMPLEMENTED` where legitimately optional. Don't mark `PASS` until command and result exist; avoid assigning A30 PASS to unimplemented idempotency.

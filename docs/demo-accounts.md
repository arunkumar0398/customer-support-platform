# Synthetic demo accounts

These accounts and tickets are generated only for local assessment development and testing. They are not real customer data and their shared password must never be reused for an actual account or deployed environment.

The local seed command targets only the loopback `support_dev` database and role. Run migrations before `npm run db:seed`. Database integration tests call the same idempotent seed function only after verifying the disposable `support_test` identity.

All accounts use the synthetic password `SupportDemo-Only-2026!`. Passwords are stored as salted scrypt hashes with `N=32768`, `r=8`, and `p=1`; the seed stores only those hashes.

| Organization | Role | Email |
|---|---|---|
| Alpha Support | Admin | `admin.alpha@example.test` |
| Alpha Support | Agent | `agent.alpha@example.test` |
| Alpha Support | Customer | `customer.alpha.one@example.test` |
| Alpha Support | Customer | `customer.alpha.two@example.test` |
| Beta Support | Admin | `admin.beta@example.test` |
| Beta Support | Agent | `agent.beta@example.test` |
| Beta Support | Customer | `customer.beta.one@example.test` |
| Beta Support | Customer | `customer.beta.two@example.test` |

Each organization has ticket numbers 1–4, covering `OPEN`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`, all four priorities, assigned and unassigned tickets, two customer owners, and an overdue active ticket. Beta records provide foreign-organization identifiers for Alpha negative authorization cases and vice versa.

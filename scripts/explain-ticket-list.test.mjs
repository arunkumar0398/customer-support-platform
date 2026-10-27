import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTicketListExplainQueries } from './explain-ticket-list.mjs';

test('builds tenant-scoped, parameterized ticket list plans with stable ordering', () => {
  const organizationId = '9aab6a48-4491-4d46-b1c2-854ec9e7a362';
  const queries = buildTicketListExplainQueries(organizationId);

  assert.deepEqual(queries.map(({ name }) => name), [
    'status-first-page',
    'status-deep-page',
    'status-count',
    'substring-search',
  ]);

  for (const { sql, values } of queries) {
    assert.match(sql, /"organizationId" = \$1/);
    assert.match(sql, /"status" = \$2/);
    assert.deepEqual(values.slice(0, 2), [organizationId, 'OPEN']);
    assert.equal(sql.includes(organizationId), false);
  }

  assert.match(queries[0].sql, /ORDER BY "createdAt" DESC, "id" DESC LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(queries[0].values, [organizationId, 'OPEN', 25, 0]);
  assert.deepEqual(queries[1].values, [organizationId, 'OPEN', 100, 2400]);
  assert.match(queries[2].sql, /^SELECT count\(\*\) FROM "Ticket"/);
  assert.deepEqual(queries[2].values, [organizationId, 'OPEN']);
  assert.match(queries[3].sql, /"title" ILIKE \$3/);
  assert.match(queries[3].sql, /"description" ILIKE \$3/);
  assert.deepEqual(queries[3].values, [organizationId, 'OPEN', '%needle-not-present%', 25, 0]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCiLog } from './sanitize-ci-log.mjs';

test('redacts nested auth headers, cookies, bearer tokens, database URLs, and configured secrets', () => {
  const input = [
    '  Set-Cookie: support_session=indented-session-secret; Path=/api',
    '{"authorization":"Bearer json-bearer-secret","headers":{"cookie":"support_session=json-session-secret; Path=/api"}}',
    'Authorization: Bearer plain-bearer-secret',
    'postgresql://support_test:db-password@127.0.0.1:5433/support_test?schema=public',
    'configured=workflow-secret',
  ].join('\n');

  const output = sanitizeCiLog(input, ['db-password', 'workflow-secret']);

  for (const value of ['indented-session-secret', 'json-bearer-secret', 'json-session-secret', 'plain-bearer-secret', 'db-password', 'workflow-secret']) {
    assert.equal(output.includes(value), false, 'sensitive value remained in log: ' + value);
  }
  assert.match(output, /\[REDACTED_DATABASE_URL\]/);
});

test('removes ANSI escape sequences from captured command output', () => {
  assert.equal(sanitizeCiLog('\u001b[31mred failure\u001b[0m'), 'red failure');
});

import { readFileSync } from 'node:fs';

const SENSITIVE_ENV_NAMES = ['POSTGRES_SUPERUSER_PASSWORD', 'APP_DB_PASSWORD', 'TEST_DB_PASSWORD', 'SESSION_SECRET', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'TEST_DATABASE_URL'];

export function sanitizeCiLog(output, sensitiveValues = []) {
  let sanitized = output;
  for (const value of sensitiveValues) {
    if (value) sanitized = sanitized.replaceAll(value, '[REDACTED]');
  }
  return sanitized
    .replace(new RegExp(String.fromCharCode(27) + '\\[[0-?]*[ -/]*[@-~]', 'g'), '')
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(["']?(?:set-cookie|cookie|authorization|proxy-authorization|x-csrf-token)["']?\s*:\s*)("[^"]*"|'[^']*'|[^,}\r\n]+)/gi, '$1"[REDACTED]"')
    .replace(/(^\s*(?:set-cookie|cookie|authorization|proxy-authorization|x-csrf-token)\s*:\s*)[^\r\n]*/gim, '$1[REDACTED]')
    .replace(/support_session=[^;\s"',}]+/gi, 'support_session=[REDACTED]')
    .replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const rawPath = process.argv[2];
  if (!rawPath) {
    process.stderr.write('Usage: node scripts/sanitize-ci-log.mjs <raw-log-path>\n');
    process.exitCode = 2;
  } else {
    const values = SENSITIVE_ENV_NAMES.map((name) => process.env[name]);
    process.stdout.write(sanitizeCiLog(readFileSync(rawPath, 'utf8'), values));
  }
}

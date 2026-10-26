import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootEnvironmentFile = resolve(repositoryRoot, '.env');

if (existsSync(rootEnvironmentFile)) process.loadEnvFile(rootEnvironmentFile);

// Generation does not connect to PostgreSQL; migrations still fail safely at
// loopback port 1 unless a real direct URL is supplied in the environment.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED
  ?? 'postgresql://unconfigured:unconfigured@127.0.0.1:1/unconfigured';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrationUrl,
  },
});

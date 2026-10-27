import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './web/tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: [
    {
      command: 'npm exec -- tsx api/tests/e2e-server.ts',
      url: 'http://127.0.0.1:3101/api/health/ready',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace web -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

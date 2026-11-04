import { provisionProductionDemoCommand } from './cli.js';

provisionProductionDemoCommand().catch(() => {
  console.error('Supabase Production demo provisioning stopped. If a run ID was confirmed, preserve private recovery files and reconcile that exact run before retrying. No credentials or connection values were printed.');
  process.exitCode = 1;
});

import { cleanupCommand } from './cli.js';

cleanupCommand(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`Fixture cleanup failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  process.exitCode = 1;
});

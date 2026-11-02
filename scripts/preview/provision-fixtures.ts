import { provisionCommand } from './cli.js';

provisionCommand(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`Fixture provisioning failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  process.exitCode = 1;
});

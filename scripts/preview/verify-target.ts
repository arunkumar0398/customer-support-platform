import { verifyTargetCommand } from './cli.js';

verifyTargetCommand(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`Target verification failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  process.exitCode = 1;
});

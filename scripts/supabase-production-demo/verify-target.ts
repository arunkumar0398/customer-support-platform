import { verifyProductionTargetCommand } from './cli.js';

verifyProductionTargetCommand(process.argv.slice(2)).catch(() => {
  console.error('Supabase Production target verification failed; connection values are never printed.');
  process.exitCode = 1;
});

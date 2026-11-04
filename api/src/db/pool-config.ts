/**
 * Vercel functions may scale horizontally. Limit each warm instance to one
 * client-side PostgreSQL connection until Preview concurrency and pooler
 * metrics justify increasing it. Keep the larger local pool for development.
 */
export function postgresPoolMax(environment: { VERCEL?: string }): number {
  return environment.VERCEL === '1' ? 1 : 10;
}

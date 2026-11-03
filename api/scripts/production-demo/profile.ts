export interface ProductionTargetProfile {
  readonly projectId: string;
  readonly branchId: string;
  readonly endpointId: string;
  readonly database: string;
  readonly username: string;
}

// Project, branch, endpoint, and database IDs were verified read-only by the
// owner. The console exposes only its broad owner role; verifier policy
// requires a dedicated account-provisioner role instead. This profile does
// not establish runtime binding or authorize provisioning.
export const OBSERVED_PRODUCTION_DATABASE_ROLE = 'neondb_owner';
const PRODUCTION_TARGET_PROFILE: Readonly<ProductionTargetProfile> = Object.freeze({
  projectId: 'silent-math-31251761',
  branchId: 'br-noisy-pond-a1yc6ozn',
  endpointId: 'ep-dark-cake-a1mpys0t',
  database: 'neondb',
  username: 'production_demo_provisioner',
});

export function getProductionTargetProfile(): Readonly<ProductionTargetProfile> | null {
  return PRODUCTION_TARGET_PROFILE;
}

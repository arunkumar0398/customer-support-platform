import { describe, expect, it } from 'vitest';
import {
  getProductionTargetProfile,
  OBSERVED_PRODUCTION_DATABASE_ROLE,
} from '../../scripts/production-demo/profile.js';

describe('code-owned Production target profile', () => {
  it('uses owner-confirmed target IDs and a dedicated least-privilege role', () => {
    expect(getProductionTargetProfile()).toEqual({
      projectId: 'silent-math-31251761',
      branchId: 'br-noisy-pond-a1yc6ozn',
      endpointId: 'ep-dark-cake-a1mpys0t',
      database: 'neondb',
      username: 'production_demo_provisioner',
    });
    expect(OBSERVED_PRODUCTION_DATABASE_ROLE).toBe('neondb_owner');
  });
});

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/modules/auth/password.js';

describe('shared password hashing for provisioned synthetic users', () => {
  it('uses the application scrypt format and verifies only the matching password', async () => {
    const password = 'synthetic-preview-password';
    const encoded = await hashPassword(password);
    expect(encoded).toMatch(/^\$scrypt\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword('incorrect-password', encoded)).resolves.toBe(false);
  });

  it('uses a fresh random salt for every password', async () => {
    const [first, second] = await Promise.all([hashPassword('same-password-long-enough'), hashPassword('same-password-long-enough')]);
    expect(first).not.toBe(second);
  });

  it.each(['', 'plain-text', '$scrypt$1$1$1$bad$bad', '$scrypt$32768$8$1$' + 'a'.repeat(32) + '$' + 'g'.repeat(64)])
  ('rejects malformed stored hashes without throwing', async (hash) => {
    await expect(verifyPassword('synthetic-password', hash)).resolves.toBe(false);
  });
});

import { describe, expect, test } from 'bun:test';
import { BunPasswordHasher } from '@/infrastructure/authentication/bun-password-hasher';

describe('BunPasswordHasher', () => {
  const hasher = new BunPasswordHasher();

  test('hashes with Argon2id and never stores plaintext', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).not.toBe('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  test('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(await hasher.verify('correct horse battery staple', hash)).toBe(true);
    expect(await hasher.verify('wrong password', hash)).toBe(false);
  });
});

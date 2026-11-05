import type { PasswordHasher } from '@/app/ports/password-hasher';

const ARGON2_OPTIONS = {
  algorithm: 'argon2id',
  memoryCost: 19_456,
  timeCost: 2,
} as const;

export class BunPasswordHasher implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return Bun.password.hash(plainPassword, ARGON2_OPTIONS);
  }

  verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    return Bun.password.verify(plainPassword, passwordHash);
  }
}

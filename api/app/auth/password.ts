// Password hashing helpers backed by Bun's native password API.

/** Hashes a plaintext password for storage. */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

/** Verifies a plaintext password against a stored hash. */
export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return Bun.password.verify(password, passwordHash);
}

import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenCodec } from '@/app/ports/refresh-token-codec';

// The token carries 256 random bits, so a plain SHA-256 is enough; a slow hash would only
// add latency to every refresh.
export class RandomRefreshTokenCodec implements RefreshTokenCodec {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

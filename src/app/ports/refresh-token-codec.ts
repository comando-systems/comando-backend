export interface RefreshTokenCodec {
  // A new opaque, unguessable token.
  generate(): string;
  // Deterministic digest used to store and look the token up.
  hash(token: string): string;
}

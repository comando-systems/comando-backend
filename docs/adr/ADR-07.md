# ADR-07: Session lifetime with refresh tokens

- Status: Accepted
- Date: 2026-11-05

## Context

Access tokens are JWTs that live 15 minutes with no refresh. A waiter would be signed out in the middle of a shift, and storing the password on the device to sign in again is worse for security.

## Decision

- Keep short access tokens and add refresh tokens with rotation.
- `POST /auth/login` also returns an opaque refresh token. Only its hash is stored (`refresh_tokens.token_hash`).
- `POST /auth/refresh` exchanges a valid refresh token for a new access token and a new refresh token, and revokes the old one. Reusing a revoked token revokes every refresh token of that user.
- `POST /auth/logout` revokes the presented refresh token.
- Deactivating a user revokes their refresh tokens, and the actor is reloaded from the database on every operation, so access ends at once.
- Refresh tokens expire after a configurable period (default 30 days). The app keeps them in the platform secure storage.

## Consequences

- Needs the `refresh_tokens` table that already exists, a token generator and hasher in the infrastructure, new use cases, routes, and tests (rotation, reuse detection, expiry, revocation on deactivation).
- Logs and audit events never contain tokens.

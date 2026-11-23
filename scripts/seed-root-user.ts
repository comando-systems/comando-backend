// Bootstrap: creating a user through the API needs an administrator, so the first
// root user is created here, straight through the repositories. Safe to run more
// than once: it is a no-op when an active administrator already exists.
//
// Delegates to seed-root-entrypoint.ts which avoids the `@/` path alias (not
// resolved by Bun when running scripts directly outside of `bun test`).
import { main } from './seed-root-entrypoint';

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

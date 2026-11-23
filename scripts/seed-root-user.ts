// Bootstrap: creating a user through the API needs an administrator, so the first
// root user is created here, straight through the repositories. Safe to run more
// than once: it is a no-op when an active administrator already exists.
import { createContainer } from '../src/app/container';

const email = (process.env.ROOT_EMAIL ?? 'root@comando.com').trim().toLowerCase();
const password = process.env.ROOT_PASSWORD;

if (!password || password.length < 12) {
  throw new Error('ROOT_PASSWORD (12+ characters) is required');
}

const container = createContainer();

try {
  const passwordHash = await container.passwordHasher.hash(password);

  const created = await container.unitOfWork.run(async (repositories) => {
    const existing = await repositories.users.findByEmail(email);
    if (existing !== null) {
      return false;
    }

    const activeAdmins = await repositories.users.countActiveAdmins();
    if (activeAdmins > 0) {
      return false;
    }

    await repositories.users.create({
      name: 'Root Administrator',
      email,
      passwordHash,
      roles: ['ADMIN', 'CASHIER', 'SERVER'],
      now: container.clock.now(),
    });
    return true;
  });

  process.stdout.write(created ? 'Root user created\n' : 'Root user already exists\n');
} finally {
  await container.close();
}

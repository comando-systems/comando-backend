// Bootstrap: creating a user through the API needs an administrator, so the first one is created
// here, straight through the repositories. Safe to run more than once.
import { loadConfig } from '../src/app/config';
import { createContainer } from '../src/app/container';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) are required');
}

const container = createContainer(loadConfig());

try {
  const passwordHash = await container.passwordHasher.hash(password);

  const created = await container.unitOfWork.run(async (repositories) => {
    if ((await repositories.users.findByEmail(email)) !== null) {
      return false;
    }

    await repositories.users.create({
      name: 'Administrator',
      email,
      passwordHash,
      roles: ['ADMIN', 'CASHIER', 'SERVER'],
      now: container.clock.now(),
    });
    return true;
  });

  process.stdout.write(created ? 'Administrator created\n' : 'Administrator already exists\n');
} finally {
  await container.close();
}

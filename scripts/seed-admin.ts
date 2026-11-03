
import { loadConfig } from '../src/app/config';
import { createAuth } from '../src/infrastructure/auth';

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ chars) are required');
}

const { auth, close } = createAuth(loadConfig());

try {
  const context = await auth.$context;

  if (await context.internalAdapter.findUserByEmail(email)) {
    process.stdout.write('Admin already exists\n');
  } else {
    const user = await context.internalAdapter.createUser({
      email,
      name: 'Administrator',
      role: 'ADMIN',
      emailVerified: true,
    });
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: await context.password.hash(password),
    });
    process.stdout.write('Admin created\n');
  }
} finally {
  await close();
}

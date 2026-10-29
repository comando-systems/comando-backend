import { hashPassword } from "@/app/auth/password";
import { closeDatabase } from "@/db";
import { roleRepository } from "@/domain/roles/repositories/role.repository";
import { userRepository } from "@/domain/users/repositories/user.repository";

async function seed(): Promise<void> {
  await roleRepository.ensureDefaults();
  console.log("Default roles ensured: ADMIN, CAIXA, GARCOM.");

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap an administrator.",
    );
    return;
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must have at least 8 characters");
  }

  const adminRole = await roleRepository.findByName("ADMIN");

  if (!adminRole) {
    throw new Error("ADMIN role was not created");
  }

  const existing = await userRepository.findByEmail(email);

  if (existing) {
    await roleRepository.assignToUser(existing.id, adminRole.id);
    console.log(`Administrator already exists: ${email}`);
    return;
  }

  const name = process.env.ADMIN_NAME?.trim() || "Administrator";
  const user = await userRepository.create({
    name,
    email,
    passwordHash: await hashPassword(password),
  });

  await roleRepository.assignToUser(user.id, adminRole.id);
  console.log(`Administrator created: ${email}`);
}

try {
  await seed();
} finally {
  await closeDatabase();
}

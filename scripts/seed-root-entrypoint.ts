// Entrypoint para o serviço `seed-root` do docker-compose.
// Importa módulos usando caminhos relativos diretos para evitar dependência
// do alias `@/` (definido em tsconfig.json), que o Bun não resolve ao rodar
// scripts diretamente fora de `bun test`.
import { SQL } from 'bun';

const DATABASE_URL = process.env.DATABASE_WRITE_URL;
const ROOT_EMAIL = (process.env.ROOT_EMAIL ?? 'root@comando.com').trim().toLowerCase();
const ROOT_PASSWORD = process.env.ROOT_PASSWORD ?? '';

if (!DATABASE_URL) {
  throw new Error('DATABASE_WRITE_URL is required');
}
if (ROOT_PASSWORD.length < 12) {
  throw new Error('ROOT_PASSWORD (12+ characters) is required');
}

const sql = new SQL(DATABASE_URL, { max: 5, idleTimeout: 20, connectionTimeout: 10 });

export async function main(): Promise<void> {
  try {
    // Verifica se já existe um administrador ativo
    const activeAdmins = await sql`
      SELECT COUNT(*) AS count FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'ADMIN' AND u.deleted_at IS NULL
    `;
    const count = Number((activeAdmins as unknown as { count: string }[])[0]?.count ?? 0);

    if (count > 0) {
      process.stdout.write('Root user already exists\n');
      return;
    }

    // Verifica se o email já existe (mesmo inativo)
    const existing = await sql`
      SELECT id FROM users WHERE email = ${ROOT_EMAIL}
    `;
    if ((existing as unknown[]).length > 0) {
      process.stdout.write('Root user already exists\n');
      return;
    }

    const passwordHash = await Bun.password.hash(ROOT_PASSWORD, {
      algorithm: 'argon2id',
    });

    const now = new Date().toISOString();

    await sql.transaction(async (tx) => {
      const [user] = (await tx`
        INSERT INTO users (name, email, password_hash, created_at, updated_at)
        VALUES ('Root Administrator', ${ROOT_EMAIL}, ${passwordHash}, ${now}, ${now})
        RETURNING id
      `) as unknown as { id: number }[];
      if (!user) {
        throw new Error('Failed to create root user');
      }

      const roles = (await tx`
        SELECT id, code FROM roles WHERE code IN ('ADMIN', 'CASHIER', 'SERVER')
      `) as unknown as { id: number; code: string }[];

      const roleIds = roles.map((r) => r.id);
      for (const roleId of roleIds) {
        await tx`
          INSERT INTO user_roles (user_id, role_id, assigned_at)
          VALUES (${user.id}, ${roleId}, ${now})
        `;
      }
    });

    process.stdout.write('Root user created\n');
  } finally {
    await sql.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

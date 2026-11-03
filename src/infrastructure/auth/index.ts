import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc } from 'better-auth/plugins/admin/access';
import { Pool } from 'pg';
import type { AppConfig } from '@/app/config';

const accessControl = createAccessControl({ ...adminAc.statements });

// Only ADMIN reaches the admin endpoints. Business permissions
// (orders, items) stay in the domain, which is their single source of truth.
const roles = {
  ADMIN: accessControl.newRole(adminAc.statements),
  CASHIER: accessControl.newRole({}),
  SERVER: accessControl.newRole({}),
};

export function createAuth(config: AppConfig) {
  const pool = new Pool({ connectionString: config.databaseWriteUrl });
  const isDevelopment = config.environment === 'development';

  const auth = betterAuth({
    appName: 'Comando',
    baseURL: config.authUrl,
    secret: config.authSecret,
    database: pool,
    trustedOrigins: [`${config.appScheme}://`, ...(isDevelopment ? ['exp://*'] : [])],
    advanced: {
      database: { generateId: 'serial' },
    },
    user: {
      modelName: 'users',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      modelName: 'sessions',
      expiresIn: 60 * 60 * 12,
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      // No cookieCache: a ban must take effect on the next request.
    },
    account: {
      modelName: 'accounts',
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'verifications',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => Bun.password.hash(password, { algorithm: 'argon2id' }),
        verify: ({ hash, password }) => Bun.password.verify(password, hash),
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': {
          window: config.loginRateLimitWindowSeconds,
          max: config.loginRateLimitMax,
        },
      },
    },
    plugins: [
      expo(),
      admin({
        ac: accessControl,
        roles,
        adminRoles: ['ADMIN'],
        defaultRole: 'SERVER',
        schema: {
          user: { fields: { banReason: 'ban_reason', banExpires: 'ban_expires' } },
          session: { fields: { impersonatedBy: 'impersonated_by' } },
        },
      }),
    ],
  });

  return { auth, close: () => pool.end() };
}

export type Auth = ReturnType<typeof createAuth>['auth'];

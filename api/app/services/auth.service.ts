// Authentication use cases: login, profile lookup, and password change.
import { hashPassword, verifyPassword } from "@/app/auth/password";
import { signToken } from "@/app/auth/token";
import { ForbiddenError, UnauthorizedError } from "@/app/errors";
import { knownRoleNames, type IRoleRepository } from "@/domain/roles";
import {
  requireUser,
  requireUserWithRoles,
  toPublicUser,
  toPublicUserFrom,
  type IUserRepository,
  type PublicUser,
} from "@/domain/users";

/** Authenticates users and issues tokens; only active users with roles may log in. */
export class AuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly roles: IRoleRepository,
  ) {}

  /** Validates credentials and signs a token. */
  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: PublicUser }> {
    const user = await this.users.findByEmail(email);

    // Unknown accounts and bad passwords share one message to avoid enumeration.
    if (!user || !user.active) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);

    if (!validPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const roleRows = await this.roles.findUserRoles(user.id);
    const roles = knownRoleNames(roleRows.map((role) => role.name));

    // Tokens are only issued to users with at least one known role.
    if (roles.length === 0) {
      throw new ForbiddenError("User has no roles assigned");
    }

    return {
      token: signToken(user.id),
      user: toPublicUserFrom(user, roles),
    };
  }

  /** Returns the public profile of an authenticated user. */
  async profile(userId: number): Promise<PublicUser> {
    const row = requireUserWithRoles(await this.users.findWithRoles(userId));
    return toPublicUser(row);
  }

  /** Replaces the password only after verifying the current one. */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = requireUser(await this.users.findById(userId));
    const validPassword = await verifyPassword(
      currentPassword,
      user.passwordHash,
    );

    if (!validPassword) {
      throw new UnauthorizedError("Current password is invalid");
    }

    await this.users.update(userId, {
      passwordHash: await hashPassword(newPassword),
    });
  }
}

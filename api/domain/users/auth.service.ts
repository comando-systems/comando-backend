import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/app/errors";
import { hashPassword, verifyPassword } from "@/app/auth/password";
import { signToken } from "@/app/auth/token";
import type { IRoleRepository } from "@/domain/roles/repositories/role.repository";
import { isRoleName } from "@/domain/roles/permissions";
import type { IUserRepository } from "./repositories/user.repository";
import { toPublicUser, toPublicUserFrom, type PublicUser } from "./user.presenter";

export class AuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly roles: IRoleRepository,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: PublicUser }> {
    const user = await this.users.findByEmail(email);

    if (!user || !user.active) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);

    if (!validPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const roleRows = await this.roles.findUserRoles(user.id);
    const roles = roleRows.map((role) => role.name).filter(isRoleName);

    if (roles.length === 0) {
      throw new ForbiddenError("User has no roles assigned");
    }

    return {
      token: signToken(user.id),
      user: toPublicUserFrom(user, roles),
    };
  }

  async profile(userId: number): Promise<PublicUser> {
    const row = await this.users.findWithRoles(userId);

    if (!row) {
      throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }

    return toPublicUser(row);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }

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

import type { User } from '@/domain/entity/user';
import type { UserID } from '@/domain/value-objects/ids';

export interface UserPageOptions {
  readonly page: number;
  readonly pageSize: number;
}

export interface UserPage {
  readonly users: readonly User[];
  readonly total: number;
}

// Read-only: Better Auth owns user creation, credentials, roles, and bans.
export interface UserRepository {
  findById(id: UserID): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(options: UserPageOptions): Promise<UserPage>;
}

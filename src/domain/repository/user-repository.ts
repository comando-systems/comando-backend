import type { Role, User } from '@/domain/entity/user';
import type { UserID } from '@/domain/value-objects/ids';

export interface UserPageOptions {
  readonly page: number;
  readonly pageSize: number;
}

export interface UserPage {
  readonly users: readonly User[];
  readonly total: number;
}

export interface CreateUserRecord {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly roles: readonly Role[];
  readonly now: Date;
}

export interface UserRepository {
  findById(id: UserID): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(record: CreateUserRecord): Promise<User>;
  update(user: User): Promise<void>;
  list(options: UserPageOptions): Promise<UserPage>;
}

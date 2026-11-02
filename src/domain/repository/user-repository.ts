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

export interface UserRepository {
  findById(id: UserID): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: User): Promise<void>;
  update(user: User): Promise<void>;
  list(options: UserPageOptions): Promise<UserPage>;
}

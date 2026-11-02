// Persistence contract for users and their role assignments.
import type { DbExecutor } from "@/db";
import type { NewUser, User, UserWithRoles } from ".";

export interface IUserRepository {
  findById(id: number, client?: DbExecutor): Promise<User | undefined>;
  findByEmail(email: string, client?: DbExecutor): Promise<User | undefined>;
  findWithRoles(
    id: number,
    client?: DbExecutor,
  ): Promise<UserWithRoles | undefined>;
  findAll(client?: DbExecutor): Promise<User[]>;
  findAllWithRoles(client?: DbExecutor): Promise<UserWithRoles[]>;
  create(data: NewUser, client?: DbExecutor): Promise<User>;
  update(
    id: number,
    data: Partial<NewUser>,
    client?: DbExecutor,
  ): Promise<User | undefined>;
  delete(id: number, client?: DbExecutor): Promise<boolean>;
}

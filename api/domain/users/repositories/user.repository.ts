import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type NewUser, type User } from "@/db/schema/users";

export interface IUserRepository {
  findById(id: number): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  findAll(): Promise<User[]>;
  create(data: NewUser): Promise<User>;
  update(id: number, data: Partial<NewUser>): Promise<User | undefined>;
  delete(id: number): Promise<boolean>;
}

export class UserRepository implements IUserRepository {
  async findById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async findAll(): Promise<User[]> {
    return db.select().from(users);
  }

  async create(data: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async update(id: number, data: Partial<NewUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async delete(id: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
}

export const userRepository = new UserRepository();

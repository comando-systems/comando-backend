import type { User } from "@/db/schema/users";

export class UserEntity implements User {
  id!: number;
  name!: string;
  email!: string;
  passwordHash!: string;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static create(props: Omit<User, "id" | "createdAt" | "updatedAt">): UserEntity {
    const entity = new UserEntity();
    Object.assign(entity, props);
    entity.active = props.active ?? true;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
    return entity;
  }

  isActive(): boolean {
    return this.active;
  }
}

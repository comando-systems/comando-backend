import type { Role } from "@/db/schema/roles";

export class RoleEntity implements Role {
  id!: number;
  name!: string;
  createdAt!: Date;

  static create(props: Omit<Role, "id" | "createdAt">): RoleEntity {
    const entity = new RoleEntity();
    Object.assign(entity, props);
    entity.createdAt = new Date();
    return entity;
  }
}

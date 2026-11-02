// Public barrel for the roles domain module.

/** Role domain model. */
export interface Role {
  id: number;
  name: string;
  createdAt: Date;
}

export type NewRole = Pick<Role, "name"> & Partial<Pick<Role, "createdAt">>;

export type RoleSummary = Pick<Role, "id" | "name">;

export * from "./enums";
export * from "./permissions";
export * from "./IRole.repository";

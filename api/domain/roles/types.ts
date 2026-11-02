// Role domain model and the minimal shape returned by role listing endpoints.
export interface Role {
  id: number;
  name: string;
  createdAt: Date;
}

export type NewRole = Pick<Role, "name"> & Partial<Pick<Role, "createdAt">>;

export type RoleSummary = Pick<Role, "id" | "name">;

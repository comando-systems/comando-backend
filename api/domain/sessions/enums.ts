// Session enums mirror the PostgreSQL enums and feed HTTP validation.
export const SESSION_TYPES = ["TABLE", "COUNTER"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_STATUSES = ["OPEN", "CLOSED", "CANCELLED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_ITEM_STATUSES = ["ACTIVE", "REMOVED"] as const;
export type SessionItemStatus = (typeof SESSION_ITEM_STATUSES)[number];

import { requireNonEmptyString, requireValidDate } from '@/domain/entity/validation';
import type { AuditLogID, UserID } from '@/domain/value-objects/ids';

export interface NewAuditLog {
  readonly actorUserId: UserID | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly requestId: string | null;
  // Never put credentials, tokens, or password hashes here.
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AuditLogProps extends NewAuditLog {
  readonly id: AuditLogID;
  readonly createdAt: Date;
}

/**
 * An append-only record of a security or business action.
 */
export class AuditLog {
  private constructor(private readonly props: AuditLogProps) {}

  static restore(props: AuditLogProps): AuditLog {
    return new AuditLog({
      id: props.id,
      actorUserId: props.actorUserId,
      action: requireNonEmptyString(props.action, 'Action', 100),
      targetType: requireNonEmptyString(props.targetType, 'Target type', 80),
      targetId: props.targetId,
      requestId: props.requestId,
      metadata: Object.freeze({ ...props.metadata }),
      createdAt: requireValidDate(props.createdAt, 'Created at'),
    });
  }

  get id(): AuditLogID {
    return this.props.id;
  }

  get actorUserId(): UserID | null {
    return this.props.actorUserId;
  }

  get action(): string {
    return this.props.action;
  }

  get targetType(): string {
    return this.props.targetType;
  }

  get targetId(): string | null {
    return this.props.targetId;
  }

  get requestId(): string | null {
    return this.props.requestId;
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return this.props.metadata;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }
}

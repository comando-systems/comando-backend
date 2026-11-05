import { requireBasisPoints } from '@/domain/entity/order/pricing';
import { requireValidDate } from '@/domain/entity/validation';
import type { UserID } from '@/domain/value-objects/ids';

export interface SettingsProps {
  serviceFeeEnabled: boolean;
  // 10% is 1000. Integer basis points keep decimal percentages exact.
  serviceFeeBasisPoints: number;
  updatedByUserId: UserID | null;
  updatedAt: Date;
}

export interface UpdateSettingsInput {
  readonly serviceFeeEnabled?: boolean;
  readonly serviceFeeBasisPoints?: number;
  readonly byUserId: UserID;
  readonly now: Date;
}

/**
 * Application-wide settings. There is a single instance.
 */
export class Settings {
  private constructor(private readonly props: SettingsProps) {}

  static restore(props: SettingsProps): Settings {
    return new Settings({
      serviceFeeEnabled: props.serviceFeeEnabled,
      serviceFeeBasisPoints: requireBasisPoints(props.serviceFeeBasisPoints, 'Service fee'),
      updatedByUserId: props.updatedByUserId,
      updatedAt: requireValidDate(props.updatedAt, 'Updated at'),
    });
  }

  get serviceFeeEnabled(): boolean {
    return this.props.serviceFeeEnabled;
  }

  get serviceFeeBasisPoints(): number {
    return this.props.serviceFeeBasisPoints;
  }

  get updatedByUserId(): UserID | null {
    return this.props.updatedByUserId;
  }

  get updatedAt(): Date {
    return new Date(this.props.updatedAt.getTime());
  }

  // The rate an order snapshots: zero while the fee is switched off.
  get effectiveServiceFeeBasisPoints(): number {
    return this.props.serviceFeeEnabled ? this.props.serviceFeeBasisPoints : 0;
  }

  update(input: UpdateSettingsInput): void {
    if (input.serviceFeeEnabled !== undefined) {
      this.props.serviceFeeEnabled = input.serviceFeeEnabled;
    }

    if (input.serviceFeeBasisPoints !== undefined) {
      this.props.serviceFeeBasisPoints = requireBasisPoints(
        input.serviceFeeBasisPoints,
        'Service fee',
      );
    }

    this.props.updatedByUserId = input.byUserId;
    this.props.updatedAt = requireValidDate(input.now, 'Now');
  }
}

import { describe, expect, test } from 'bun:test';
import { recordAudit } from '@/app/audit';
import { CreateUserUseCase, UpdateSettingsUseCase } from '@/app/use-cases';
import { Settings } from '@/domain/entity/settings';
import type { Repositories } from '@/domain/repository';
import type { AuditEvent } from '@/domain/repository/audit-log-repository';
import { UserID } from '@/domain/value-objects/ids';
import { fakeUnitOfWork, fakeUsers, makeUser, NOW } from '../support/fakes';

const admin = makeUser('1', ['ADMIN']);
const clock = { now: () => NOW };

function auditedWorld() {
  const events: AuditEvent[] = [];
  const settings = Settings.restore({
    serviceFeeEnabled: false,
    serviceFeeBasisPoints: 1000,
    updatedByUserId: null,
    updatedAt: NOW,
  });
  const unitOfWork = fakeUnitOfWork({
    auditLogs: {
      record: async (event) => {
        events.push(event);
      },
    },
    users: fakeUsers({
      findById: async () => admin,
      findByEmail: async () => null,
      create: async (input) => makeUser('2', input.roles),
    }),
    settings: { get: async () => settings, save: async () => {} },
  } as Partial<Repositories>);

  return { events, unitOfWork };
}

describe('audit events', () => {
  test('recordAudit maps its arguments onto the repository event', async () => {
    const events: AuditEvent[] = [];
    const repositories = {
      auditLogs: {
        record: async (event: AuditEvent) => {
          events.push(event);
        },
      },
    } as unknown as Repositories;

    await recordAudit(
      repositories,
      { actorUserId: new UserID('7'), requestId: 'req-1' },
      'item.remove',
      {
        type: 'item',
        id: '9',
      },
    );
    await recordAudit(repositories, { actorUserId: null }, 'auth.refresh.reuse', {
      type: 'user',
      id: null,
    });

    expect(events).toEqual([
      {
        actorUserId: new UserID('7'),
        action: 'item.remove',
        targetType: 'item',
        targetId: '9',
        requestId: 'req-1',
        metadata: {},
      },
      {
        actorUserId: null,
        action: 'auth.refresh.reuse',
        targetType: 'user',
        targetId: null,
        requestId: null,
        metadata: {},
      },
    ]);
  });

  test('creating a user is audited without the password or its hash', async () => {
    const { events, unitOfWork } = auditedWorld();

    await new CreateUserUseCase(
      unitOfWork,
      { hash: async () => 'secret-hash', verify: async () => true },
      clock,
    ).execute({
      actorUserId: admin.id,
      requestId: 'req-2',
      name: 'Ada',
      email: 'ada@example.com',
      password: 'plain-password',
      roles: ['SERVER'],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'user.create', requestId: 'req-2' });
    expect(JSON.stringify(events)).not.toContain('plain-password');
    expect(JSON.stringify(events)).not.toContain('secret-hash');
  });

  test('changing the settings records the new values', async () => {
    const { events, unitOfWork } = auditedWorld();

    await new UpdateSettingsUseCase(unitOfWork, clock).execute({
      actorUserId: admin.id,
      serviceFeeEnabled: true,
      serviceFeeBasisPoints: 1200,
    });

    expect(events[0]).toMatchObject({
      action: 'settings.update',
      targetType: 'settings',
      requestId: null,
      metadata: { serviceFeeEnabled: true, serviceFeeBasisPoints: 1200 },
    });
  });
});

import { describe, expect, test } from 'bun:test';
import { ForbiddenError, ValidationError } from '@/app/errors';
import { GetSalesSummaryUseCase } from '@/app/use-cases';
import type { Repositories } from '@/domain/repository';
import type { SalesRange, SalesSummary } from '@/domain/repository/report-repository';
import { fakeUnitOfWork, fakeUsers, makeUser } from '../support/fakes';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-03-10T15:30:00.000Z');
const admin = makeUser('1', ['ADMIN']);
const cashier = makeUser('2', ['CASHIER']);

function summaryOf(overrides: Partial<SalesSummary> = {}): SalesSummary {
  return {
    closedOrders: 4,
    revenueCents: 10_001,
    canceledOrders: 1,
    openOrders: 2,
    byMethod: [{ method: 'CASH', amountCents: 10_001 }],
    ...overrides,
  };
}

function world(summary: SalesSummary = summaryOf()) {
  const ranges: SalesRange[] = [];
  const unitOfWork = fakeUnitOfWork({
    users: fakeUsers({
      findById: async (id) => [admin, cashier].find((user) => user.id.equals(id)) ?? null,
    }),
    reports: {
      salesSummary: async (range: SalesRange) => {
        ranges.push(range);
        return summary;
      },
    },
  } as unknown as Partial<Repositories>);

  return { useCase: new GetSalesSummaryUseCase(unitOfWork, { now: () => now }), ranges };
}

describe('sales summary', () => {
  test('defaults to today in UTC', async () => {
    const { useCase, ranges } = world();

    const result = await useCase.execute({ actorUserId: admin.id });

    expect(result.from.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-03-11T00:00:00.000Z');
    expect(ranges).toEqual([{ from: result.from, to: result.to }]);
  });

  test('completes a one-sided range with a day', async () => {
    const { useCase } = world();
    const from = new Date('2026-03-01T03:00:00.000Z');
    const to = new Date('2026-03-05T03:00:00.000Z');

    const fromOnly = await useCase.execute({ actorUserId: admin.id, from });
    const toOnly = await useCase.execute({ actorUserId: admin.id, to });

    expect(fromOnly.to.getTime() - fromOnly.from.getTime()).toBe(DAY_MS);
    expect(fromOnly.from).toEqual(from);
    expect(toOnly.to).toEqual(to);
    expect(toOnly.to.getTime() - toOnly.from.getTime()).toBe(DAY_MS);
  });

  test('keeps the range the client sends, so the day follows the shop time zone', async () => {
    const { useCase } = world();
    const from = new Date('2026-03-10T03:00:00.000Z');
    const to = new Date('2026-03-11T03:00:00.000Z');

    const result = await useCase.execute({ actorUserId: admin.id, from, to });

    expect([result.from, result.to]).toEqual([from, to]);
  });

  test('computes the average ticket, rounding half up, and zero without orders', async () => {
    const withOrders = await world(
      summaryOf({ closedOrders: 4, revenueCents: 10_001 }),
    ).useCase.execute({
      actorUserId: admin.id,
    });
    const empty = await world(
      summaryOf({ closedOrders: 0, revenueCents: 0, byMethod: [] }),
    ).useCase.execute({ actorUserId: admin.id });

    expect(withOrders.averageTicketCents).toBe(2500);
    expect(empty.averageTicketCents).toBe(0);
    expect(empty.byMethod).toEqual([]);
  });

  test('passes the repository figures through', async () => {
    const result = await world().useCase.execute({ actorUserId: admin.id });

    expect(result).toMatchObject({
      closedOrders: 4,
      revenueCents: 10_001,
      canceledOrders: 1,
      openOrders: 2,
      byMethod: [{ method: 'CASH', amountCents: 10_001 }],
    });
  });

  test('rejects an empty or inverted range, and one longer than a year', async () => {
    const { useCase } = world();
    const base = new Date('2026-03-01T00:00:00.000Z');

    await expect(
      useCase.execute({ actorUserId: admin.id, from: base, to: base }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute({ actorUserId: admin.id, from: new Date(base.getTime() + DAY_MS), to: base }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute({
        actorUserId: admin.id,
        from: base,
        to: new Date(base.getTime() + 367 * DAY_MS),
      }),
    ).rejects.toThrow('cannot exceed 366 days');
    await expect(
      useCase.execute({
        actorUserId: admin.id,
        from: base,
        to: new Date(base.getTime() + 366 * DAY_MS),
      }),
    ).resolves.toBeDefined();
  });

  test('rejects an invalid date', async () => {
    await expect(
      world().useCase.execute({ actorUserId: admin.id, from: new Date('nope') }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('only administrators read it', async () => {
    await expect(world().useCase.execute({ actorUserId: cashier.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

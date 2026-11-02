// Service-level tests for session lifecycle, item history, and payments.
import { describe, expect, test } from "bun:test";
import { PaymentService, SessionService } from ".";
import { expectRejectedCode } from "@/test/assertions";
import {
  FakePaymentRepository,
  FakeProductRepository,
  FakeSessionItemRepository,
  FakeSessionRepository,
  testTransactions,
} from "@/test/fakes";

function setup() {
  const sessions = new FakeSessionRepository();
  const items = new FakeSessionItemRepository();
  const products = new FakeProductRepository();
  const payments = new FakePaymentRepository();

  return {
    sessions,
    items,
    products,
    payments,
    sessionService: new SessionService(
      sessions,
      items,
      products,
      payments,
      testTransactions,
    ),
    paymentService: new PaymentService(
      sessions,
      items,
      payments,
      testTransactions,
    ),
  };
}

async function openCounterWithItem(price: string, quantity = 1) {
  const context = setup();
  const session = await context.sessionService.open(1, { type: "COUNTER" });
  const product = context.products.seed({ price });
  const item = await context.sessionService.addItem(session.id, 1, {
    productId: product.id,
    quantity,
  });

  return { ...context, session, product, item };
}

describe("SessionService", () => {
  test("snapshots the product price when an item is added", async () => {
    const { sessionService, products, session, product, item } =
      await openCounterWithItem("10.50", 2);

    expect(item.unitPriceCents).toBe(1050);
    expect(item.subtotalCents).toBe(2100);

    await products.update(product.id, { price: "12.00" });

    const detail = await sessionService.detail(session.id);

    expect(detail.items[0]?.unitPriceCents).toBe(1050);
    expect(detail.totals.itemsCents).toBe(2100);
  });

  test("rejects modifications on a closed session", async () => {
    const { sessionService, products } = setup();
    const session = await sessionService.open(1, { type: "COUNTER" });
    const product = products.seed({ price: "5.00" });

    await sessionService.close(session.id, 1);

    await expectRejectedCode(
      sessionService.addItem(session.id, 1, {
        productId: product.id,
        quantity: 1,
      }),
      "SESSION_NOT_OPEN",
    );
  });

  test("preserves removed items for auditing", async () => {
    const { sessionService, session, item } = await openCounterWithItem("8.00");

    const removed = await sessionService.removeItem(session.id, item.id, 2);

    expect(removed.status).toBe("REMOVED");
    expect(removed.removedBy).toBe(2);
    expect(removed.removedAt).not.toBeNull();

    const detail = await sessionService.detail(session.id);

    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]?.status).toBe("REMOVED");
    expect(detail.totals.itemsCents).toBe(0);

    await expectRejectedCode(
      sessionService.removeItem(session.id, item.id, 2),
      "ITEM_ALREADY_REMOVED",
    );
  });

  test("prevents two open sessions for the same table", async () => {
    const { sessionService } = setup();

    await sessionService.open(1, { type: "TABLE", tableNumber: 5 });

    await expectRejectedCode(
      sessionService.open(1, { type: "TABLE", tableNumber: 5 }),
      "TABLE_OCCUPIED",
    );

    const other = await sessionService.open(1, {
      type: "TABLE",
      tableNumber: 6,
    });

    expect(other.tableNumber).toBe(6);
  });

  test("enforces table and counter session shape", async () => {
    const { sessionService } = setup();

    await expectRejectedCode(
      sessionService.open(1, { type: "TABLE" }),
      "VALIDATION_ERROR",
    );
    await expectRejectedCode(
      sessionService.open(1, { type: "COUNTER", tableNumber: 3 }),
      "VALIDATION_ERROR",
    );
  });

  test("rejects inactive products", async () => {
    const { sessionService, products } = setup();
    const session = await sessionService.open(1, { type: "COUNTER" });
    const product = products.seed({ price: "5.00", active: false });

    await expectRejectedCode(
      sessionService.addItem(session.id, 1, {
        productId: product.id,
        quantity: 1,
      }),
      "PRODUCT_INACTIVE",
    );
  });

  test("rejects unknown products", async () => {
    const { sessionService } = setup();
    const session = await sessionService.open(1, { type: "COUNTER" });

    await expectRejectedCode(
      sessionService.addItem(session.id, 1, { productId: 999, quantity: 1 }),
      "PRODUCT_NOT_FOUND",
    );
  });

  test("does not close a session with an outstanding balance", async () => {
    const { sessionService, session } = await openCounterWithItem("10.00");

    await expectRejectedCode(
      sessionService.close(session.id, 1),
      "OUTSTANDING_BALANCE",
    );
  });

  test("cancels only sessions without payments", async () => {
    const { sessionService, paymentService, session } =
      await openCounterWithItem("10.00");

    await paymentService.create(session.id, 1, {
      amountCents: 400,
      method: "CASH",
    });

    await expectRejectedCode(
      sessionService.cancel(session.id, 1),
      "SESSION_HAS_PAYMENTS",
    );

    const second = await sessionService.open(1, { type: "COUNTER" });
    const cancelled = await sessionService.cancel(second.id, 1);

    expect(cancelled.status).toBe("CANCELLED");
  });
});

describe("PaymentService", () => {
  test("accepts multiple payments and closes a fully settled session", async () => {
    const { sessionService, paymentService, session } =
      await openCounterWithItem("10.00");

    const first = await paymentService.create(session.id, 2, {
      amountCents: 400,
      method: "CASH",
    });

    expect(first.amountCents).toBe(400);
    expect(first.receivedBy).toBe(2);

    await expectRejectedCode(
      paymentService.create(session.id, 2, {
        amountCents: 700,
        method: "PIX",
      }),
      "PAYMENT_EXCEEDS_BALANCE",
    );

    await paymentService.create(session.id, 2, {
      amountCents: 600,
      method: "DEBIT_CARD",
    });

    const detail = await sessionService.detail(session.id);

    expect(detail.totals).toEqual({
      itemsCents: 1000,
      paidCents: 1000,
      balanceCents: 0,
    });
    expect(detail.payments).toHaveLength(2);

    const closed = await sessionService.close(session.id, 2);

    expect(closed.status).toBe("CLOSED");
    expect(closed.closedBy).toBe(2);

    await expectRejectedCode(
      paymentService.create(session.id, 2, {
        amountCents: 100,
        method: "CASH",
      }),
      "SESSION_NOT_OPEN",
    );
  });

  test("rejects payments for sessions without active items", async () => {
    const { sessionService, paymentService } = setup();
    const session = await sessionService.open(1, { type: "COUNTER" });

    await expectRejectedCode(
      paymentService.create(session.id, 1, {
        amountCents: 100,
        method: "CASH",
      }),
      "SESSION_HAS_NO_ITEMS",
    );
  });

  test("rejects payments when the session is already settled", async () => {
    const { sessionService, paymentService, session } =
      await openCounterWithItem("5.00");

    await paymentService.create(session.id, 1, {
      amountCents: 500,
      method: "CASH",
    });

    await expectRejectedCode(
      paymentService.create(session.id, 1, {
        amountCents: 100,
        method: "CASH",
      }),
      "SESSION_ALREADY_PAID",
    );
  });
});

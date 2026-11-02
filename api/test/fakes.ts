// In-memory repository fakes used by service tests; they mimic database behavior
// without touching PostgreSQL.
import type { TransactionManager } from "@/app/transaction";
import type {
  IPaymentRepository,
  NewPayment,
  Payment,
} from "@/domain/payments";
import type {
  IProductRepository,
  NewProduct,
  Product,
} from "@/domain/products";
import type {
  ISessionItemRepository,
  ISessionRepository,
  NewServiceSession,
  NewSessionItem,
  ServiceSession,
  SessionItem,
  SessionStatus,
} from "@/domain/sessions";

// Tests run without a database, so transactions simply pass no client through.
export const testTransactions: TransactionManager = {
  transaction: (work) => work(undefined),
};

function now(): Date {
  return new Date();
}

/** In-memory session repository that enforces the same open-state transitions. */
export class FakeSessionRepository implements ISessionRepository {
  readonly rows: ServiceSession[] = [];
  private nextId = 1;

  async findById(id: number): Promise<ServiceSession | undefined> {
    return this.rows.find((row) => row.id === id);
  }

  async findByIdForUpdate(id: number): Promise<ServiceSession | undefined> {
    return this.findById(id);
  }

  async findOpenByTableNumber(
    tableNumber: number,
  ): Promise<ServiceSession | undefined> {
    return this.rows.find(
      (row) => row.tableNumber === tableNumber && row.status === "OPEN",
    );
  }

  async findByStatus(
    status?: SessionStatus,
  ): Promise<ServiceSession[]> {
    return status
      ? this.rows.filter((row) => row.status === status)
      : [...this.rows];
  }

  async findAllOpen(): Promise<ServiceSession[]> {
    return this.findByStatus("OPEN");
  }

  async create(data: NewServiceSession): Promise<ServiceSession> {
    const session: ServiceSession = {
      id: this.nextId++,
      type: data.type,
      status: data.status ?? "OPEN",
      tableNumber: data.tableNumber ?? null,
      openedBy: data.openedBy,
      closedBy: data.closedBy ?? null,
      openedAt: data.openedAt ?? now(),
      closedAt: data.closedAt ?? null,
      notes: data.notes ?? null,
    };

    this.rows.push(session);
    return session;
  }

  async close(
    id: number,
    closedBy: number,
  ): Promise<ServiceSession | undefined> {
    return this.finish(id, "CLOSED", closedBy);
  }

  async cancel(
    id: number,
    closedBy: number,
  ): Promise<ServiceSession | undefined> {
    return this.finish(id, "CANCELLED", closedBy);
  }

  private finish(
    id: number,
    status: SessionStatus,
    closedBy: number,
  ): ServiceSession | undefined {
    const session = this.rows.find(
      (row) => row.id === id && row.status === "OPEN",
    );

    if (!session) {
      return undefined;
    }

    session.status = status;
    session.closedBy = closedBy;
    session.closedAt = now();
    return session;
  }
}

/** In-memory item repository with logical removal semantics. */
export class FakeSessionItemRepository implements ISessionItemRepository {
  readonly rows: SessionItem[] = [];
  private nextId = 1;

  async findById(id: number): Promise<SessionItem | undefined> {
    return this.rows.find((row) => row.id === id);
  }

  async findBySessionId(sessionId: number): Promise<SessionItem[]> {
    return this.rows.filter((row) => row.sessionId === sessionId);
  }

  async findActiveBySessionId(sessionId: number): Promise<SessionItem[]> {
    return this.rows.filter(
      (row) => row.sessionId === sessionId && row.status === "ACTIVE",
    );
  }

  async add(data: NewSessionItem): Promise<SessionItem> {
    const item: SessionItem = {
      id: this.nextId++,
      sessionId: data.sessionId,
      productId: data.productId,
      quantity: data.quantity ?? "1",
      unitPrice: data.unitPrice,
      status: data.status ?? "ACTIVE",
      addedBy: data.addedBy,
      addedAt: data.addedAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
      removedAt: data.removedAt ?? null,
      removedBy: data.removedBy ?? null,
    };

    this.rows.push(item);
    return item;
  }

  async removeForSession(
    sessionId: number,
    itemId: number,
    removedBy: number,
  ): Promise<SessionItem | undefined> {
    const item = this.rows.find(
      (row) =>
        row.id === itemId &&
        row.sessionId === sessionId &&
        row.status === "ACTIVE",
    );

    if (!item) {
      return undefined;
    }

    item.status = "REMOVED";
    item.removedBy = removedBy;
    item.removedAt = now();
    item.updatedAt = now();
    return item;
  }
}

/** In-memory product repository; `seed` inserts catalog rows for tests. */
export class FakeProductRepository implements IProductRepository {
  readonly rows: Product[] = [];
  private nextId = 1;

  private insert(data: NewProduct): Product {
    const id = this.nextId++;
    const product: Product = {
      id,
      name: data.name,
      description: data.description ?? null,
      price: data.price,
      active: data.active ?? true,
      createdAt: now(),
      updatedAt: now(),
    };

    this.rows.push(product);
    return product;
  }

  seed(input: { name?: string; price: string; active?: boolean }): Product {
    return this.insert({
      name: input.name ?? `Product ${this.nextId}`,
      price: input.price,
      active: input.active,
    });
  }

  async findById(id: number): Promise<Product | undefined> {
    return this.rows.find((row) => row.id === id);
  }

  async findByActive(active: boolean): Promise<Product[]> {
    return this.rows.filter((row) => row.active === active);
  }

  async findAllActive(): Promise<Product[]> {
    return this.findByActive(true);
  }

  async findAll(): Promise<Product[]> {
    return [...this.rows];
  }

  async create(data: NewProduct): Promise<Product> {
    return this.insert(data);
  }

  async update(
    id: number,
    data: Partial<NewProduct>,
  ): Promise<Product | undefined> {
    const product = this.rows.find((row) => row.id === id);

    if (!product) {
      return undefined;
    }

    Object.assign(product, data, { updatedAt: now() });
    return product;
  }

  async deactivate(id: number): Promise<Product | undefined> {
    return this.update(id, { active: false });
  }
}

/** Append-only in-memory payment repository. */
export class FakePaymentRepository implements IPaymentRepository {
  readonly rows: Payment[] = [];
  private nextId = 1;

  async findBySessionId(sessionId: number): Promise<Payment[]> {
    return this.rows.filter((row) => row.sessionId === sessionId);
  }

  async create(data: NewPayment): Promise<Payment> {
    const payment: Payment = {
      id: this.nextId++,
      sessionId: data.sessionId,
      amount: data.amount,
      method: data.method,
      receivedBy: data.receivedBy,
      paidAt: data.paidAt ?? now(),
      notes: data.notes ?? null,
    };

    this.rows.push(payment);
    return payment;
  }
}

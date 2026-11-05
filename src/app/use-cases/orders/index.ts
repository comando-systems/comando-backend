import type { AddOrderItemsUseCase } from '@/app/use-cases/orders/add-order-items';
import type { CancelOrderUseCase } from '@/app/use-cases/orders/cancel-order';
import type { ChangeOrderItemQuantityUseCase } from '@/app/use-cases/orders/change-order-item-quantity';
import type { CloseOrderUseCase } from '@/app/use-cases/orders/close-order';
import type { CreateCounterOrderUseCase } from '@/app/use-cases/orders/create-counter-order';
import type { GetOrderUseCase } from '@/app/use-cases/orders/get-order';
import type { ListOrdersUseCase } from '@/app/use-cases/orders/list-orders';
import type { OpenTableOrderUseCase } from '@/app/use-cases/orders/open-table-order';

export {
  type AddOrderItemsInput,
  AddOrderItemsUseCase,
} from '@/app/use-cases/orders/add-order-items';
export {
  type CancelOrderInput,
  CancelOrderUseCase,
} from '@/app/use-cases/orders/cancel-order';
export {
  type ChangeOrderItemQuantityInput,
  ChangeOrderItemQuantityUseCase,
} from '@/app/use-cases/orders/change-order-item-quantity';
export { type CloseOrderInput, CloseOrderUseCase } from '@/app/use-cases/orders/close-order';
export {
  type CreateCounterOrderInput,
  CreateCounterOrderUseCase,
} from '@/app/use-cases/orders/create-counter-order';
export { type GetOrderInput, GetOrderUseCase } from '@/app/use-cases/orders/get-order';
export {
  type ListOrdersInput,
  type ListOrdersResult,
  ListOrdersUseCase,
} from '@/app/use-cases/orders/list-orders';
export {
  type OpenTableOrderInput,
  OpenTableOrderUseCase,
} from '@/app/use-cases/orders/open-table-order';

export interface OrdersUseCases {
  readonly createCounter: CreateCounterOrderUseCase;
  readonly openTable: OpenTableOrderUseCase;
  readonly addItems: AddOrderItemsUseCase;
  readonly changeItemQuantity: ChangeOrderItemQuantityUseCase;
  readonly close: CloseOrderUseCase;
  readonly cancel: CancelOrderUseCase;
  readonly list: ListOrdersUseCase;
  readonly get: GetOrderUseCase;
}

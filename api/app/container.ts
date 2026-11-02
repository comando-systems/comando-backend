// Composition root: wires repositories, transactions, and application services.

import {
  AuthService,
  PaymentService,
  ProductService,
  SessionService,
  UserService,
} from "@/app/services";
import {
  paymentRepository,
  productRepository,
  roleRepository,
  sessionItemRepository,
  sessionRepository,
  userRepository,
} from "@/domain/repositories";
import { databaseTransactions } from "./transaction";

/** Singleton service instances shared by every HTTP route. */
export const services = {
  auth: new AuthService(userRepository, roleRepository),
  users: new UserService(userRepository, roleRepository, databaseTransactions),
  products: new ProductService(productRepository),
  sessions: new SessionService(
    sessionRepository,
    sessionItemRepository,
    productRepository,
    paymentRepository,
    databaseTransactions,
  ),
  payments: new PaymentService(
    sessionRepository,
    sessionItemRepository,
    paymentRepository,
    databaseTransactions,
  ),
};

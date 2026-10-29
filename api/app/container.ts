import { AuthService } from "@/domain/users/auth.service";
import { UserService } from "@/domain/users/user.service";
import { userRepository } from "@/domain/users/repositories/user.repository";
import { roleRepository } from "@/domain/roles/repositories/role.repository";
import { ProductService } from "@/domain/products/product.service";
import { productRepository } from "@/domain/products/repositories/product.repository";
import { SessionService } from "@/domain/sessions/session.service";
import { sessionRepository } from "@/domain/sessions/repositories/session.repository";
import { sessionItemRepository } from "@/domain/sessions/repositories/session-item.repository";
import { PaymentService } from "@/domain/payments/payment.service";
import { paymentRepository } from "@/domain/payments/repositories/payment.repository";
import { databaseTransactions } from "./transaction";

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

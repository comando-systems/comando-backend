import { authRoutes } from "./auth.routes";
import { userRoutes } from "./users.routes";
import { productRoutes } from "./products.routes";
import { sessionRoutes } from "./sessions.routes";
import { paymentRoutes } from "./payments.routes";

export const routes = {
  "/": () => Response.json({ status: "ok" }),
  "/health": () => Response.json({ status: "ok" }),
  ...authRoutes,
  ...userRoutes,
  ...productRoutes,
  ...sessionRoutes,
  ...paymentRoutes,
};

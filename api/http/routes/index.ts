// Combines all route maps into the object consumed by Bun.serve.
import { authRoutes } from "./auth.routes";
import { userRoutes } from "./users.routes";
import { productRoutes } from "./products.routes";
import { sessionRoutes } from "./sessions.routes";
import { paymentRoutes } from "./payments.routes";

const health = () => Response.json({ status: "ok" });

// Route modules expose non-overlapping paths; liveness probes stay unauthenticated.
export const routes = {
  "/": health,
  "/health": health,
  ...authRoutes,
  ...userRoutes,
  ...productRoutes,
  ...sessionRoutes,
  ...paymentRoutes,
};

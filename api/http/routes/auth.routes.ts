// Authentication endpoints: login, current profile, and self-service password change.
import { services } from "@/app/container";
import { authenticate } from "@/http/middleware/auth";
import { json, noContent } from "@/http/response";
import { handle } from "@/http/handle";
import { Input, readJson } from "@/http/validation";

export const authRoutes = {
  "/auth/login": {
    POST: handle(async (request: Bun.BunRequest<"/auth/login">) => {
      const input = new Input(await readJson(request));
      const email = input.email("email");
      const password = input.string("password", { min: 1, max: 128 });

      return json(await services.auth.login(email, password));
    }),
  },
  "/auth/me": {
    GET: handle(async (request: Bun.BunRequest<"/auth/me">) => {
      const actor = await authenticate(request);
      return json(await services.auth.profile(actor.user.id));
    }),
  },
  "/auth/password": {
    PUT: handle(async (request: Bun.BunRequest<"/auth/password">) => {
      // Authenticated users may change only their own password.
      const actor = await authenticate(request);
      const input = new Input(await readJson(request));
      const currentPassword = input.string("currentPassword", {
        min: 1,
        max: 128,
      });
      const newPassword = input.string("newPassword", { min: 8, max: 128 });

      await services.auth.changePassword(
        actor.user.id,
        currentPassword,
        newPassword,
      );

      return noContent();
    }),
  },
};

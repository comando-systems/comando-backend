import { services } from "@/app/container";
import { MAX_MONEY_CENTS } from "@/domain/money/money";
import { authenticate, requirePermission } from "@/http/middleware/auth";
import { json } from "@/shared/http/json";
import { handle } from "@/shared/http/route";
import { Input, parseId, readJson } from "@/shared/validation";

const PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "PIX",
  "OTHER",
] as const;

export const paymentRoutes = {
  "/sessions/:id/payments": {
    GET: handle(async (request: Bun.BunRequest<"/sessions/:id/payments">) => {
      const actor = await authenticate(request);
      requirePermission(actor, "payments:read");

      return json(
        await services.payments.listBySession(parseId(request.params.id)),
      );
    }),
    POST: handle(async (request: Bun.BunRequest<"/sessions/:id/payments">) => {
      const actor = await authenticate(request);
      requirePermission(actor, "payments:create");

      const input = new Input(await readJson(request));
      const amountCents = input.integer("amountCents", {
        min: 1,
        max: MAX_MONEY_CENTS,
      });
      const method = input.enum("method", PAYMENT_METHODS);
      const notes = input.nullableString("notes", { max: 1_000 });

      return json(
        await services.payments.create(
          parseId(request.params.id),
          actor.user.id,
          { amountCents, method, notes },
        ),
        201,
      );
    }),
  },
};

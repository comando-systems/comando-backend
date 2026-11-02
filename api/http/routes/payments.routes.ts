// Session payment endpoints; amounts are validated in integer cents.
import { services } from "@/app/container";
import { MAX_MONEY_CENTS } from "@/domain/money";
import { PAYMENT_METHODS } from "@/domain/payments";
import { authorize } from "@/http/middleware/auth";
import { json } from "@/http/response";
import { handle } from "@/http/handle";
import { Input, parseId, readJson } from "@/http/validation";

export const paymentRoutes = {
  "/sessions/:id/payments": {
    GET: handle(async (request: Bun.BunRequest<"/sessions/:id/payments">) => {
      await authorize(request, "payments:read");

      return json(
        await services.payments.listBySession(parseId(request.params.id)),
      );
    }),
    POST: handle(async (request: Bun.BunRequest<"/sessions/:id/payments">) => {
      // Only roles allowed to settle sessions may record a payment.
      const actor = await authorize(request, "payments:create");

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

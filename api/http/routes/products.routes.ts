import { services } from "@/app/container";
import { MAX_MONEY_CENTS } from "@/domain/money/money";
import { authenticate, requirePermission } from "@/http/middleware/auth";
import { json } from "@/shared/http/json";
import { handle } from "@/shared/http/route";
import {
  Input,
  parseBooleanParam,
  parseId,
  readJson,
} from "@/shared/validation";

export const productRoutes = {
  "/products": {
    GET: handle(async (request: Bun.BunRequest<"/products">) => {
      const actor = await authenticate(request);
      requirePermission(actor, "products:read");

      const active = parseBooleanParam(
        new URL(request.url).searchParams.get("active"),
        "active",
      );

      return json(await services.products.list({ active }));
    }),
    POST: handle(async (request: Bun.BunRequest<"/products">) => {
      const actor = await authenticate(request);
      requirePermission(actor, "products:manage");

      const input = new Input(await readJson(request));
      const name = input.string("name", { min: 1, max: 150 });
      const description = input.nullableString("description", { max: 2_000 });
      const priceCents = input.integer("priceCents", {
        min: 0,
        max: MAX_MONEY_CENTS,
      });

      return json(
        await services.products.create({ name, description, priceCents }),
        201,
      );
    }),
  },
  "/products/:id": {
    GET: handle(async (request: Bun.BunRequest<"/products/:id">) => {
      const actor = await authenticate(request);
      requirePermission(actor, "products:read");

      return json(await services.products.getById(parseId(request.params.id)));
    }),
    PATCH: handle(async (request: Bun.BunRequest<"/products/:id">) => {
      const actor = await authenticate(request);
      requirePermission(actor, "products:manage");

      const input = new Input(await readJson(request));
      const name = input.optionalString("name", { min: 1, max: 150 });
      const description = input.nullableString("description", { max: 2_000 });
      const priceCents = input.optionalInteger("priceCents", {
        min: 0,
        max: MAX_MONEY_CENTS,
      });
      const active = input.optionalBoolean("active");

      return json(
        await services.products.update(parseId(request.params.id), {
          name,
          description,
          priceCents,
          active,
        }),
      );
    }),
    DELETE: handle(async (request: Bun.BunRequest<"/products/:id">) => {
      const actor = await authenticate(request);
      requirePermission(actor, "products:manage");

      return json(
        await services.products.deactivate(parseId(request.params.id)),
      );
    }),
  },
};

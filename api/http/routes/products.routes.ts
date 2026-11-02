// Product catalog endpoints; reads are broad, mutations require products:manage.
import { services } from "@/app/container";
import { MAX_MONEY_CENTS } from "@/domain/money";
import { authorize } from "@/http/middleware/auth";
import { json } from "@/http/response";
import { handle } from "@/http/handle";
import {
  Input,
  parseBooleanParam,
  parseId,
  readJson,
} from "@/http/validation";

const NAME_OPTIONS = { min: 1, max: 150 } as const;
const DESCRIPTION_OPTIONS = { max: 2_000 } as const;
const PRICE_OPTIONS = { min: 0, max: MAX_MONEY_CENTS } as const;

export const productRoutes = {
  "/products": {
    GET: handle(async (request: Bun.BunRequest<"/products">) => {
      await authorize(request, "products:read");

      const active = parseBooleanParam(
        new URL(request.url).searchParams.get("active"),
        "active",
      );

      return json(await services.products.list({ active }));
    }),
    POST: handle(async (request: Bun.BunRequest<"/products">) => {
      await authorize(request, "products:manage");

      const input = new Input(await readJson(request));
      const name = input.string("name", NAME_OPTIONS);
      const description = input.nullableString("description", DESCRIPTION_OPTIONS);
      const priceCents = input.integer("priceCents", PRICE_OPTIONS);

      return json(
        await services.products.create({ name, description, priceCents }),
        201,
      );
    }),
  },
  "/products/:id": {
    GET: handle(async (request: Bun.BunRequest<"/products/:id">) => {
      await authorize(request, "products:read");

      return json(await services.products.getById(parseId(request.params.id)));
    }),
    PATCH: handle(async (request: Bun.BunRequest<"/products/:id">) => {
      await authorize(request, "products:manage");

      const input = new Input(await readJson(request));
      const name = input.optionalString("name", NAME_OPTIONS);
      const description = input.nullableString("description", DESCRIPTION_OPTIONS);
      const priceCents = input.optionalInteger("priceCents", PRICE_OPTIONS);
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
      await authorize(request, "products:manage");

      // Deactivation is a soft delete; historical session items keep the product.
      return json(
        await services.products.deactivate(parseId(request.params.id)),
      );
    }),
  },
};

// Service session endpoints: opening, items, closing, and cancellation.
import { services } from "@/app/container";
import { authorize } from "@/http/middleware/auth";
import { json } from "@/http/response";
import { handle } from "@/http/handle";
import {
  Input,
  parseEnumParam,
  parseId,
  readJson,
} from "@/http/validation";
import {
  SESSION_STATUSES,
  SESSION_TYPES,
} from "@/domain/sessions";

export const sessionRoutes = {
  "/sessions": {
    GET: handle(async (request: Bun.BunRequest<"/sessions">) => {
      await authorize(request, "sessions:read");

      const status = parseEnumParam(
        new URL(request.url).searchParams.get("status"),
        SESSION_STATUSES,
        "status",
      );

      return json(await services.sessions.list(status));
    }),
    POST: handle(async (request: Bun.BunRequest<"/sessions">) => {
      const actor = await authorize(request, "sessions:open");

      const input = new Input(await readJson(request));
      const type = input.enum("type", SESSION_TYPES);
      // Table assignment is validated against `type` in the domain layer.
      const tableNumber = input.optionalInteger("tableNumber", {
        min: 1,
        max: 9_999,
      });
      const notes = input.nullableString("notes", { max: 1_000 });

      return json(
        await services.sessions.open(actor.user.id, {
          type,
          tableNumber,
          notes,
        }),
        201,
      );
    }),
  },
  "/sessions/:id": {
    GET: handle(async (request: Bun.BunRequest<"/sessions/:id">) => {
      await authorize(request, "sessions:read");

      return json(await services.sessions.detail(parseId(request.params.id)));
    }),
  },
  "/sessions/:id/close": {
    POST: handle(async (request: Bun.BunRequest<"/sessions/:id/close">) => {
      const actor = await authorize(request, "sessions:close");

      return json(
        await services.sessions.close(
          parseId(request.params.id),
          actor.user.id,
        ),
      );
    }),
  },
  "/sessions/:id/cancel": {
    POST: handle(async (request: Bun.BunRequest<"/sessions/:id/cancel">) => {
      const actor = await authorize(request, "sessions:cancel");

      return json(
        await services.sessions.cancel(
          parseId(request.params.id),
          actor.user.id,
        ),
      );
    }),
  },
  "/sessions/:id/items": {
    GET: handle(async (request: Bun.BunRequest<"/sessions/:id/items">) => {
      await authorize(request, "sessions:read");

      return json(await services.sessions.listItems(parseId(request.params.id)));
    }),
    POST: handle(async (request: Bun.BunRequest<"/sessions/:id/items">) => {
      const actor = await authorize(request, "items:manage");

      const input = new Input(await readJson(request));
      const productId = input.integer("productId", { min: 1 });
      // Quantities keep three decimal places to match numeric(10, 3).
      const quantity = input.decimal("quantity", {
        min: 0.001,
        max: 100_000,
        scale: 3,
      });

      return json(
        await services.sessions.addItem(
          parseId(request.params.id),
          actor.user.id,
          { productId, quantity },
        ),
        201,
      );
    }),
  },
  "/sessions/:id/items/:itemId": {
    DELETE: handle(
      async (request: Bun.BunRequest<"/sessions/:id/items/:itemId">) => {
        const actor = await authorize(request, "items:manage");

        return json(
          await services.sessions.removeItem(
            parseId(request.params.id),
            parseId(request.params.itemId, "itemId"),
            actor.user.id,
          ),
        );
      },
    ),
  },
};

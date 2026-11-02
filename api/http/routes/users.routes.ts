// User administration endpoints, all gated by users:manage.
import { ValidationError } from "@/app/errors";
import { services } from "@/app/container";
import { authorize } from "@/http/middleware/auth";
import { isRoleName, type RoleName } from "@/domain/roles";
import { json } from "@/http/response";
import { handle } from "@/http/handle";
import { Input, parseId, readJson } from "@/http/validation";

function readRoles(input: Input): RoleName[] {
  // Role names are a closed set; reject unknown values before hitting the DB.
  return input.stringArray("roles", { minLength: 1 }).map((value) => {
    if (!isRoleName(value)) {
      throw new ValidationError("Unknown role", "roles");
    }

    return value;
  });
}

export const userRoutes = {
  "/users": {
    GET: handle(async (request: Bun.BunRequest<"/users">) => {
      await authorize(request, "users:manage");

      return json(await services.users.list());
    }),
    POST: handle(async (request: Bun.BunRequest<"/users">) => {
      await authorize(request, "users:manage");

      const input = new Input(await readJson(request));
      const name = input.string("name", { min: 2, max: 120 });
      const email = input.email("email");
      const password = input.string("password", { min: 8, max: 128 });
      const roles = readRoles(input);

      return json(
        await services.users.create({ name, email, password, roles }),
        201,
      );
    }),
  },
  "/users/:id": {
    GET: handle(async (request: Bun.BunRequest<"/users/:id">) => {
      await authorize(request, "users:manage");

      return json(await services.users.getById(parseId(request.params.id)));
    }),
    PATCH: handle(async (request: Bun.BunRequest<"/users/:id">) => {
      const actor = await authorize(request, "users:manage");

      const input = new Input(await readJson(request));
      const name = input.optionalString("name", { min: 2, max: 120 });
      const email = input.optionalEmail("email");
      const password = input.optionalString("password", { min: 8, max: 128 });
      const active = input.optionalBoolean("active");

      return json(
        await services.users.update(
          parseId(request.params.id),
          { name, email, password, active },
          actor.user.id,
        ),
      );
    }),
    DELETE: handle(async (request: Bun.BunRequest<"/users/:id">) => {
      const actor = await authorize(request, "users:manage");

      return json(
        await services.users.deactivate(
          parseId(request.params.id),
          actor.user.id,
        ),
      );
    }),
  },
  "/users/:id/roles": {
    PUT: handle(async (request: Bun.BunRequest<"/users/:id/roles">) => {
      await authorize(request, "users:manage");

      const input = new Input(await readJson(request));
      const roles = readRoles(input);

      // PUT replaces the full role set, so a user may hold several roles.
      return json(
        await services.users.setRoles(parseId(request.params.id), roles),
      );
    }),
  },
  "/roles": {
    GET: handle(async (request: Bun.BunRequest<"/roles">) => {
      await authorize(request, "users:manage");

      return json(await services.users.listRoles());
    }),
  },
};

// Seeds the demo catalog with curated products and categories. Safe to rerun: an item is
// skipped when its name already exists. Uses the root user from `db:seed-root` as the actor.
import { createContainer } from '../src/app/container';
import { catalogSeedItems } from './data/catalog';

const ROOT_EMAIL = (process.env.ROOT_EMAIL ?? 'root@comando.com').trim().toLowerCase();

async function main(): Promise<void> {
  const container = createContainer();

  try {
    const actorUserId = await container.unitOfWork.read(async (repositories) => {
      const root = await repositories.users.findByEmail(ROOT_EMAIL);

      if (root === null) {
        throw new Error(`Root user ${ROOT_EMAIL} not found. Run db:seed-root first`);
      }

      return root.id;
    });

    let created = 0;

    for (const product of catalogSeedItems) {
      const exists = await container.unitOfWork.read((repositories) =>
        repositories.items.existsByName(product.name),
      );

      if (exists) {
        continue;
      }

      await container.useCases.items.create.execute({
        requestId: 'seed-items',
        actorUserId,
        name: product.name,
        description: product.description,
        categories: product.categories,
        priceCents: product.priceCents,
        imageUrl: product.imageUrl,
        enabled: true,
      });
      created += 1;
    }

    process.stdout.write(
      `Catalog seed complete: ${created} created, ${catalogSeedItems.length - created} already present\n`,
    );
  } finally {
    await container.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

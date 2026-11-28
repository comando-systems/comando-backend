import { Category, normalizeCategoryName } from '@/domain/entity/category';
import type { CategoryRepository as CategoryRepositoryContract } from '@/domain/repository/category-repository';
import { CategoryID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

interface CategoryRow {
  id: string;
  name: string;
}

function mapCategory(row: CategoryRow): Category {
  return Category.restore({ id: new CategoryID(row.id), name: row.name });
}

export class CategoryRepository implements CategoryRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findOrCreateByName(name: string): Promise<Category> {
    const normalizedName = normalizeCategoryName(name);
    const sql = this.database.writeSql();

    await sql.query`
      INSERT INTO categories (name, normalized_name)
      VALUES (${normalizedName}, ${normalizedName.toLocaleLowerCase()})
      ON CONFLICT (normalized_name) DO NOTHING
    `;

    const rows = await sql.query<CategoryRow[]>`
      SELECT id::text AS id, name FROM categories
      WHERE normalized_name = ${normalizedName.toLocaleLowerCase()}
    `;
    const row = rows[0];

    if (row === undefined) {
      throw new Error('Failed to create category');
    }

    return mapCategory(row);
  }
}

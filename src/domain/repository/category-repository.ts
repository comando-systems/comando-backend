import type { Category } from '@/domain/entity/category';

export interface CategoryRepository {
  findOrCreateByName(name: string): Promise<Category>;
}

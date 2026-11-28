import { requireNonEmptyString } from '@/domain/entity/validation';
import type { CategoryID } from '@/domain/value-objects/ids';

export const CATEGORY_NAME_MAX_LENGTH = 80;

export function normalizeCategoryName(value: string): string {
  return requireNonEmptyString(value, 'Category', CATEGORY_NAME_MAX_LENGTH);
}

export interface CategoryProps {
  readonly id: CategoryID;
  readonly name: string;
}

/** A catalog label. Categories are shared by items through a many-to-many relation. */
export class Category {
  private constructor(private readonly props: CategoryProps) {}

  static create(props: CategoryProps): Category {
    return new Category({
      id: props.id,
      name: normalizeCategoryName(props.name),
    });
  }

  static restore(props: CategoryProps): Category {
    return Category.create(props);
  }

  get id(): CategoryID {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }
}

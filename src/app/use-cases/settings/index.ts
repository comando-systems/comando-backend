import type { GetSettingsUseCase } from '@/app/use-cases/settings/get-settings';
import type { UpdateSettingsUseCase } from '@/app/use-cases/settings/update-settings';

export { type GetSettingsInput, GetSettingsUseCase } from '@/app/use-cases/settings/get-settings';
export {
  type UpdateSettingsInput,
  UpdateSettingsUseCase,
} from '@/app/use-cases/settings/update-settings';

export interface SettingsUseCases {
  readonly get: GetSettingsUseCase;
  readonly update: UpdateSettingsUseCase;
}

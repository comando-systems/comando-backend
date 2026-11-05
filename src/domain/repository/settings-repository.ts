import type { Settings } from '@/domain/entity/settings';

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

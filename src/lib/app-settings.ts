import * as repo from './repo';

/**
 * 画面と AI の設定。確認者が「設定」画面から変更する。
 * 秘密情報（API キーなど）は .env に置き、ここには入れない。
 */
export interface AppSettings {
  /** 画面の見出しに出す会社名。 */
  companyName: string;
  /** 今日のひとこと（従業員の画面に吹き出しで出る）。 */
  oneWord: string;
  /** AI に持たせる会社の方針（社風・就業規則の要点など）。 */
  aiInstructions: string;
  /** 気象庁の地域コード（例: 270000 = 大阪府）。 */
  weatherAreaCode: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: '連絡票',
  oneWord: '',
  aiInstructions: '',
  weatherAreaCode: '270000',
};

const KEYS: (keyof AppSettings)[] = ['companyName', 'oneWord', 'aiInstructions', 'weatherAreaCode'];

export function loadSettings(): AppSettings {
  const stored = repo.getSettings();
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) {
    const value = stored[key];
    if (value !== undefined && value !== '') settings[key] = value;
  }
  // 環境変数で既定の地域を指定できるようにする（設定画面での変更が優先）。
  if (!stored.weatherAreaCode && process.env.WEATHER_AREA_CODE) {
    settings.weatherAreaCode = process.env.WEATHER_AREA_CODE;
  }
  return settings;
}

export function saveSettings(input: Partial<AppSettings>): void {
  for (const key of KEYS) {
    const value = input[key];
    if (value !== undefined) repo.setSetting(key, value);
  }
}

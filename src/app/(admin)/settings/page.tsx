import SettingsForm from '@/components/SettingsForm';
import { isAiConfigured } from '@/lib/ai';
import { loadSettings } from '@/lib/app-settings';
import { getWeather } from '@/lib/weather';

export const dynamic = 'force-dynamic';

/** 受付画面と AI の設定。秘密情報（API キー）は .env に置くため、ここでは扱わない。 */
export default async function SettingsPage() {
  const settings = loadSettings();
  const weather = await getWeather(settings.weatherAreaCode);

  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">設定</h1>
      <p className="mt-1 text-sm text-slate-500">従業員の受付画面の表示と、AI の応対方針を設定します。</p>

      <SettingsForm
        settings={settings}
        aiConfigured={isAiConfigured()}
        weatherText={
          weather
            ? `${weather.area || '取得先'}: ${weather.text}${weather.high !== null ? ` / 最高 ${weather.high}℃` : ''}${
                weather.low !== null ? ` / 最低 ${weather.low}℃` : ''
              }`
            : null
        }
      />
    </>
  );
}

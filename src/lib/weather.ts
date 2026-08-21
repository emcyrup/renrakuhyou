import { displayDate } from './day';

/**
 * 気象庁の公開データ（費用 0 円・キー不要）から今日の天気を取る。
 *   https://www.jma.go.jp/bosai/forecast/data/forecast/<地域コード>.json
 *
 * 予報の JSON は項目の並びが日によって変わるため、形を決め打ちにせず、
 * 「weathers を持つ系列」「temps を持つ系列」を探して読む。
 * 取得や解析に失敗した場合は null を返し、画面では天気の欄を出さない。
 */
export interface WeatherView {
  area: string;
  text: string;
  high: number | null;
  low: number | null;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;

let cache: { areaCode: string; at: number; value: WeatherView | null } | null = null;

type Series = { timeDefines?: unknown; areas?: unknown };

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function firstArea(series: Series): Record<string, unknown> | null {
  const areas = series.areas;
  if (!Array.isArray(areas) || areas.length === 0) return null;
  const area = areas[0];
  return typeof area === 'object' && area !== null ? (area as Record<string, unknown>) : null;
}

/** 今日の最高・最低気温を取り出す。09 時の値が最高、00 時の値が最低。 */
function readTemperatures(series: Series[], today: string): { high: number | null; low: number | null } {
  for (const entry of series) {
    const area = firstArea(entry);
    const temps = stringsOf(area?.temps);
    const defines = stringsOf(entry.timeDefines);
    if (temps.length === 0 || defines.length === 0) continue;

    let high: number | null = null;
    let low: number | null = null;

    defines.forEach((define, index) => {
      if (!define.startsWith(today)) return;
      const value = Number(temps[index]);
      if (!Number.isFinite(value)) return;

      const hour = define.slice(11, 13);
      if (hour === '00') low = value;
      else if (hour === '09') high = value;
      else {
        // 想定外の時刻の場合は、大きい方を最高・小さい方を最低として扱う。
        high = high === null ? value : Math.max(high, value);
        low = low === null ? value : Math.min(low, value);
      }
    });

    if (high !== null || low !== null) return { high, low };
  }
  return { high: null, low: null };
}

function parse(payload: unknown, today: string): WeatherView | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;

  const first = payload[0] as { timeSeries?: unknown };
  const series = Array.isArray(first?.timeSeries) ? (first.timeSeries as Series[]) : [];

  const weatherSeries = series.find((entry) => stringsOf(firstArea(entry)?.weathers).length > 0);
  if (!weatherSeries) return null;

  const area = firstArea(weatherSeries);
  const weathers = stringsOf(area?.weathers);
  const defines = stringsOf(weatherSeries.timeDefines);

  const index = defines.findIndex((define) => define.startsWith(today));
  const text = weathers[index >= 0 ? index : 0];
  if (!text) return null;

  const areaName = (area?.area as { name?: unknown } | undefined)?.name;

  // 週間予報（2 つ目の要素）にも気温があるため、日別予報に無い場合はそちらを見る。
  const weekly = payload[1] as { timeSeries?: unknown } | undefined;
  const weeklySeries = Array.isArray(weekly?.timeSeries) ? (weekly.timeSeries as Series[]) : [];

  const temps = readTemperatures(series, today);
  const fallback =
    temps.high === null && temps.low === null ? readWeeklyTemperatures(weeklySeries, today) : temps;

  return {
    area: typeof areaName === 'string' ? areaName : '',
    // 「晴れ　時々　くもり」のように全角空白が入るため詰める。
    text: text.replace(/[\s　]+/g, ''),
    high: fallback.high,
    low: fallback.low,
  };
}

function readWeeklyTemperatures(series: Series[], today: string): { high: number | null; low: number | null } {
  for (const entry of series) {
    const area = firstArea(entry);
    const max = stringsOf(area?.tempsMax);
    const min = stringsOf(area?.tempsMin);
    const defines = stringsOf(entry.timeDefines);
    if (defines.length === 0 || (max.length === 0 && min.length === 0)) continue;

    const index = defines.findIndex((define) => define.startsWith(today));
    if (index < 0) continue;

    const high = Number(max[index]);
    const low = Number(min[index]);
    return {
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
    };
  }
  return { high: null, low: null };
}

export async function getWeather(areaCode: string): Promise<WeatherView | null> {
  if (!/^\d{6}$/.test(areaCode)) return null;

  if (cache && cache.areaCode === areaCode && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  let value: WeatherView | null = null;
  try {
    const response = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${areaCode}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (response.ok) value = parse(await response.json(), displayDate());
  } catch {
    value = null;
  }

  // 失敗した場合も一定時間は再取得しない（画面の表示が遅くならないようにする）。
  cache = { areaCode, at: Date.now(), value };
  return value;
}

/** テストと自己診断のために内部の解析だけを呼べるようにする。 */
export const __internal = { parse };

'use client';

import { useActionState, useState } from 'react';
import { saveSettingsAction } from '@/app/actions';
import type { AppSettings } from '@/lib/app-settings';

/**
 * 受付画面と AI の設定。
 * React 19 ではフォーム送信後に未制御の入力が初期値に戻るため、値は state で持つ。
 */
export default function SettingsForm({
  settings,
  aiConfigured,
  weatherText,
}: {
  settings: AppSettings;
  aiConfigured: boolean;
  weatherText: string | null;
}) {
  const [result, action, pending] = useActionState(saveSettingsAction, null);
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [oneWord, setOneWord] = useState(settings.oneWord);
  const [aiInstructions, setAiInstructions] = useState(settings.aiInstructions);
  const [weatherAreaCode, setWeatherAreaCode] = useState(settings.weatherAreaCode);

  return (
    <form action={action} className="mt-4 space-y-4">
      <section className="card p-5">
        <h2 className="text-sm font-bold text-slate-800">受付画面</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label text-xs" htmlFor="companyName">
              会社名
            </label>
            <input
              id="companyName"
              name="companyName"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs" htmlFor="weatherAreaCode">
              天気の地域コード（気象庁）
            </label>
            <input
              id="weatherAreaCode"
              name="weatherAreaCode"
              value={weatherAreaCode}
              onChange={(event) => setWeatherAreaCode(event.target.value)}
              placeholder="270000"
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500">
              例: 大阪 270000 / 兵庫 280000 / 福岡 400000 / 東京 130000
              <br />
              {weatherText ? `いまの取得結果: ${weatherText}` : '※ 現在この地域の天気を取得できていません。'}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <label className="label text-xs" htmlFor="oneWord">
            今日のひとこと
          </label>
          <input
            id="oneWord"
            name="oneWord"
            value={oneWord}
            onChange={(event) => setOneWord(event.target.value)}
            placeholder="安全第一！ 焦らず、ゆとり運転でいきましょう。"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">従業員の受付画面に表示されます。空欄なら表示しません。</p>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-slate-800">AI の応対</h2>

        <p
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            aiConfigured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {aiConfigured
            ? 'API キーは設定済みです。従業員は「AI に質問する」を使えます。'
            : 'ANTHROPIC_API_KEY が未設定のため、「AI に質問する」は使えません。サーバーの .env に設定してください。'}
        </p>

        <div className="mt-3">
          <label className="label text-xs" htmlFor="aiInstructions">
            会社からの指示（社風・就業規則の要点）
          </label>
          <textarea
            id="aiInstructions"
            name="aiInstructions"
            value={aiInstructions}
            onChange={(event) => setAiInstructions(event.target.value)}
            rows={10}
            placeholder={
              '例）\n・当社は安全最優先。無理な運行はしない。\n・体調不良や事故のときは、まず安全確保のうえ運行管理者（06-xxxx-xxxx）へ電話。\n・有給は 2 週間前までに申請書を提出。\n・積み込みの手順書は事務所の棚にある。'
            }
            className="input font-mono text-xs"
          />
          <p className="mt-1 text-xs text-slate-500">
            ここに書いた内容にそって AI が応対します。書かれていないことは「担当者に確認してください」と答えます。
            <b>個人情報や口座情報など、従業員に見せてよくない内容は書かないでください。</b>
          </p>
        </div>
      </section>

      {result ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
          role={result.ok ? 'status' : 'alert'}
        >
          {result.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? '保存中…' : '保存する'}
      </button>
    </form>
  );
}

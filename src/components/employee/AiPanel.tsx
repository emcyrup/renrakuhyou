'use client';

import { useEffect, useRef, useState } from 'react';
import { useVoiceInput } from '@/components/employee/speech';

interface Turn {
  role: 'user' | 'assistant';
  body: string;
}

const EXAMPLES = ['今日の予定は？', '高速の渋滞情報はある？', '有給の申請はどうすればいい？'];

/** 「AI に質問する」。会社の方針を持った AI が、その場で答える。 */
export default function AiPanel({
  token,
  enabled,
  initialQuestion,
  onClose,
}: {
  token: string;
  enabled: boolean;
  initialQuestion: string;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState(initialQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const asked = useRef(false);

  const voice = useVoiceInput((text) => setQuestion((prev) => (prev ? `${prev} ${text}` : text)));

  // これまでのやり取りを読み込む（続けて質問できるようにするため）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/employee/${token}/ai`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as { messages?: Turn[] };
        if (!cancelled && payload.messages) setTurns(payload.messages);
      } catch {
        // 履歴が読めなくても質問はできる
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  const ask = async (text: string) => {
    const body = text.trim();
    if (!body || busy) return;

    setBusy(true);
    setError(null);
    setTurns((prev) => [...prev, { role: 'user', body }]);
    setQuestion('');

    try {
      const response = await fetch(`/api/employee/${token}/ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: body }),
      });
      const payload = (await response.json().catch(() => null)) as { answer?: string; error?: string } | null;
      if (!response.ok || !payload?.answer) throw new Error(payload?.error ?? `応答がありません（${response.status}）`);
      setTurns((prev) => [...prev, { role: 'assistant', body: payload.answer as string }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  // 下の入力欄から質問して開いた場合は、そのまま送信する。
  useEffect(() => {
    if (asked.current || !initialQuestion.trim() || !enabled) return;
    asked.current = true;
    void ask(initialQuestion);
    // ask は初回のみ呼ぶ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, enabled]);

  return (
    <section className="card flex min-h-[26rem] flex-col p-5 lg:p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-slate-900">AI に質問する</h2>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 underline">
          とじる
        </button>
      </div>

      {!enabled ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          AI の設定がまだ済んでいません。担当者にご連絡ください。
        </p>
      ) : null}

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
        {turns.length === 0 && !busy ? (
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">会社のことでも、道路のことでも聞いてください。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={!enabled}
                  onClick={() => void ask(example)}
                  className="btn-secondary px-3 py-1 text-xs"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((turn, index) => (
          <div key={index} className={turn.role === 'user' ? 'text-right' : 'text-left'}>
            <p
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                turn.role === 'user' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {turn.body}
            </p>
          </div>
        ))}

        {busy ? <p className="text-sm text-slate-500">考えています…</p> : null}
        <div ref={bottom} />
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <input
          aria-label="質問"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="質問を入力"
          maxLength={500}
          disabled={!enabled}
          className="input"
        />
        {voice.supported ? (
          <button
            type="button"
            onClick={voice.listening ? voice.stop : voice.start}
            disabled={!enabled}
            className={`${voice.listening ? 'btn-danger' : 'btn-secondary'} shrink-0`}
          >
            {voice.listening ? '停止' : '声で'}
          </button>
        ) : null}
        <button type="submit" disabled={busy || !enabled || !question.trim()} className="btn-primary shrink-0">
          送る
        </button>
      </form>
    </section>
  );
}

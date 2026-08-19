'use client';

import { useState } from 'react';

/** URL などを選択しやすく表示し、ワンタップでコピーできるようにする。 */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では、入力欄を選択状態にして手動コピーへ誘導する。
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input readOnly value={value} aria-label={label} className="input w-56 py-1 text-xs" onFocus={(e) => e.target.select()} />
      <button type="button" onClick={copy} className="btn-secondary px-2 py-1 text-xs">
        {copied ? 'コピー済' : 'コピー'}
      </button>
    </div>
  );
}

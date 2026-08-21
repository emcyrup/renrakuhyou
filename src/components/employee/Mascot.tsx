'use client';

/**
 * 受付のキャラクター。
 * 事故などの緊急の連絡があるときは表情と背景色を変えて知らせる（資料の指定）。
 * `public/mascot.png` / `public/mascot-alert.png` を置くとその画像を使い、無ければ簡易表示になる。
 */
export type MascotMood = 'normal' | 'alert' | 'done';

const FACES: Record<MascotMood, string> = {
  normal: '(=^•ᴥ•^=)',
  alert: '(=ΘᴥΘ=)',
  done: '(=^◡◡^=)',
};

const TONES: Record<MascotMood, string> = {
  normal: 'bg-brand-50 text-brand-700',
  alert: 'bg-red-100 text-red-700',
  done: 'bg-emerald-50 text-emerald-700',
};

export default function Mascot({
  mood,
  imageUrl,
  message,
}: {
  mood: MascotMood;
  imageUrl: string | null;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 会社が用意した 1 枚絵をそのまま出すだけ
        <img src={imageUrl} alt="" className="h-40 w-40 rounded-2xl object-cover lg:h-56 lg:w-56" />
      ) : (
        <div
          className={`grid h-32 w-32 place-items-center rounded-2xl text-2xl font-bold lg:h-44 lg:w-44 lg:text-3xl ${TONES[mood]}`}
          aria-hidden
        >
          {FACES[mood]}
        </div>
      )}
      <p
        className={`max-w-md rounded-2xl px-5 py-3 text-center text-sm font-semibold shadow-sm lg:text-base ${
          mood === 'alert' ? 'bg-red-50 text-red-800' : 'bg-white text-slate-800'
        }`}
      >
        {message}
      </p>
    </div>
  );
}

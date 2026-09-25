/**
 * 「Google で続行」ボタン。
 *
 * Google のブランドガイドライン（developers.google.com/identity/branding-guidelines）
 * に沿える範囲でそろえている。色・フォント・余白・ロゴはガイドラインの指定どおりで、
 * ロゴは再配色も変形もしない。文言は許可されている 3 つのうち
 * 「続行（Continue with Google）」を使う。新規も再訪も同じ入口だから。
 *
 * React Router の <Link> ではなく素の <a> を使うのが要点。
 * 遷移先 /api/auth/google は Worker 側のルートで React Router のルートではないため、
 * <Link> だとクライアント側ルーティングに飲まれて 404 になる。
 */
export function GoogleSignInButton({ next }: { next: string }) {
  return (
    <a
      href={`/api/auth/google?next=${encodeURIComponent(next)}`}
      className="flex h-[48px] w-full items-center justify-center rounded-full border border-[#747775] bg-white transition-colors hover:bg-[#f7f7f7]"
      style={{
        // ガイドラインの指定: Google Sans Medium / 14px / 行送り 20px / 文字色 #1F1F1F
        fontFamily: '"Google Sans", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: 14,
        lineHeight: "20px",
        fontWeight: 500,
        color: "#1F1F1F",
      }}
    >
      <GoogleG />
      {/* ロゴと文字の間はガイドライン指定の 10px */}
      <span style={{ marginLeft: 10 }}>Google で続行</span>
    </a>
  );
}

/** Google 公式の 4 色 G マーク。色・比率は変更しない */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

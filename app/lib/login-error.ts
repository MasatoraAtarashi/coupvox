/**
 * ログインに失敗したとき /?error=... で戻ってくる。
 *
 * 何も表示しないと「押したのに同じ画面に戻ってきた」という無反応に見え、
 * 利用者にも運用者にも原因が分からない。設定漏れと本人の操作を切り分けられる
 * 粒度で、内部事情を明かさない範囲の文言にする。
 */
export function loginErrorMessage(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case "google_denied":
      return "Google 側でログインが中断されました。もう一度おためしください。";
    case "invalid_request":
      // 戻るボタンや期限切れ（state の cookie は 10 分）で起きる
      return "ログインの途中で時間が空いたようです。もう一度おためしください。";
    case "invalid_identity":
      return "このアカウントはメールアドレスの確認が済んでいないため使えません。";
    case "oauth_unconfigured":
    case "server_misconfigured":
      return "サーバ側の設定が足りていないため、いまログインできません。管理者にお知らせください。";
    default:
      return "ログインできませんでした。時間をおいてもう一度おためしください。";
  }
}

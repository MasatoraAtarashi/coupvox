/**
 * React Router の管理外へ出る遷移先か。
 *
 * <Link> はクライアント側でルートを解決するため、/api/* のような Worker 側の
 * ルートを渡すと「該当ルート無し」＝404 になり、サーバまでリクエストが飛ばない。
 * 実際に Google ログインのボタンがこれで踏めず、押すと 404 になっていた。
 * この種の遷移は素の <a> でページごと遷移させる必要がある。
 */
export function isExternalHref(href: string): boolean {
  return href.startsWith("/api/") || /^[a-z]+:/i.test(href);
}

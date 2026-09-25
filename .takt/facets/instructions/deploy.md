以下の順番でデプロイを実行してください。途中で失敗したらデプロイせず、原因を修正してください。

1. `pnpm typecheck` を実行し、エラーがあれば修正する
2. `pnpm test` を実行し、失敗があれば修正する
3. D1 スキーマを変更している場合は `pnpm db:migrate:remote` でリモートマイグレーションを適用する
4. `pnpm deploy`（build + wrangler deploy）を実行する
5. デプロイ結果（URL・バージョン）を報告する

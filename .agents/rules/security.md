---
trigger: always_on
---
# セキュリティルール

- **secrets（API キー・トークン・パスワード）をコード・設定・コミットメッセージにハードコードしない**
  - 本番: `wrangler secret put <NAME>`（対話入力を優先し、CLI 引数に secret 値を載せない）
  - ローカル: `.dev.vars`（gitignore 済み）。手本は `.dev.vars.example` に置く
- **git hooks を回避しない**: `--no-verify` 禁止、フックが失敗したら原因を修正する
- gitleaks（pre-commit）と ASH（CI）の検出を「設定で黙らせる」前に、本当に誤検知かを理由付きで確認する
  - 誤検知の suppress は `.ash.yml` の suppressions に**理由コメント付き**で追加する
- 依存を追加したら `pnpm audit` の結果を確認する。high 以上は原則として放置しない
- `.env` / `.dev.vars` の中身をログ・PR・チャットに貼り付けない
- 生成リポジトリを公開（public）にする場合は、自分用を前提にした設定（Access のバイパス等）が残っていないか確認する

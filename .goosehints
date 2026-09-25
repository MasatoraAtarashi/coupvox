# Cloudflare Workers 開発ルール

このプロジェクトは Cloudflare Workers 上で動く。以下のルールは常に守ること。

## 基本原則

- コードは **TypeScript** で書く。適切な型・インターフェースを付ける
- **ES modules 形式のみ**（Service Worker 形式は禁止）
- 使用するメソッド・クラス・型はすべて import する
- 公式 SDK があるサービスは公式 SDK を使う。それ以外の外部依存は最小化する
- FFI / ネイティブ / C バインディングを持つライブラリは使わない
- 複雑なロジックには「なぜ」が分かるコメントを添える

## wrangler 設定（wrangler.jsonc）

- **`wrangler.jsonc` を使う**（wrangler.toml は禁止）
- `"compatibility_flags": ["nodejs_compat"]` を設定する
- `"observability": { "enabled": true }` を常に有効にする（`head_sampling_rate: 1`）
- `upload_source_maps: true` を設定する
- バインディングはコードで実際に使うものだけ宣言する
- **secrets を wrangler.jsonc やコードにハードコードしない**。secret は `wrangler secret` / ローカルは `.dev.vars`
- 依存関係は wrangler.jsonc に書かない（package.json で管理）

## ストレージ・サービスの選択指針

- キーバリュー（設定・ユーザープロフィール・A/B）: **Workers KV**
- 強い一貫性・マルチプレイヤー・エージェント状態: **Durable Objects**
- リレーショナルデータ（SQL）: **D1**
- オブジェクトストレージ（画像・AI アセット・ユーザーアップロード）: **R2**
- 既存 PostgreSQL への接続: **Hyperdrive**
- 非同期処理・バックグラウンドタスク: **Queues**（dead letter queue を必ず設定）
- 埋め込み・ベクトル検索: **Vectorize**
- イベント・メトリクス・高カーディナリティ分析: **Workers Analytics Engine**（`writeDataPoint` は await しない）
- AI 推論の既定: **Workers AI**（ユーザー指定があれば Claude/OpenAI の公式 SDK）

## Durable Objects / WebSocket

- WebSocket は **Hibernation API** を使う（レガシー WebSocket API は禁止）
- `this.ctx.acceptWebSocket(server)` で accept する（`server.accept()` は禁止）
- `async webSocketMessage()` / `async webSocketClose()` ハンドラを使う（`addEventListener` パターンは禁止）
- Upgrade リクエストは明示的に検証する
- Durable Object の binding と `migrations[].new_classes`（Agent の場合は `new_sqlite_classes`）を wrangler.jsonc に正しく書く

## AI Agents（agents ライブラリ）

- AI エージェントは `agents` ライブラリを強く優先
- ストリーミング応答を使う
- 状態管理は `this.setState` を優先（必要なら `this.sql` も可）
- `class AIAgent extends Agent<Env, MyState>` のように Env と State の型パラメータを渡す
- React クライアントは `agents/react` の `useAgent` フックを使う

## セキュリティ

- リクエストのバリデーションを適切に行う（zod 等を推奨）
- セキュリティヘッダ・CORS を適切に設定する
- レート制限を入れるべき箇所に入れる
- バインディングは最小権限の原則で
- ユーザー入力はサニタイズする

## エラーハンドリング・パフォーマンス

- 適切な HTTP ステータスコードと意味のあるエラーメッセージを返す
- エラーはログに残す（構造化ログ推奨）
- コールドスタートを意識する。不要な計算を避ける
- 必要に応じてストリーミングを使う

## テスト

- API にはユニットテストを書く（vitest + @cloudflare/vitest-pool-workers）
- 最低 5 テスト（正常系・検証エラー系・DB 層・ミドルウェア）

# コミュニケーション規約

- **日本語で応答する**
- 簡潔に。結論を先に書く
- 「〜しますか？」と何度も聞かない。必要なら前提を明示して進め、後から撤回できるようにする
- 実装完了を主張する前に、検証コマンド（typecheck / test）を実行して出力で確認する
- 分からないことは推測で埋めず、調べた根拠（docs / コードの場所）を示す

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

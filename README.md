# あいだ（coupvox）

夫婦・パートナー間の「応答性知覚」を定期的に測って、**ふたりだけで見て、対話のきっかけにする**アプリ。

- 2週間に1回、16項目のアンケートが開く（0〜5 の6件法）
- 応答性 8 項目（R1〜R8）と非応答性 8 項目（I1〜I8）。非応答性は応答性の裏返しではないため、**独立した2スコア**として扱う
- スコアは `round(平均(0〜5) × 20)` で 0〜100
- 自由記述のコメントを1つ添えられる。**共有するかどうかは書いた本人が毎回選ぶ**
- ふたりとも回答して初めて相手の結果が開く（サーバ側で制御）
- Workers AI が「今週試せること」を提案する

## プライバシーの約束

クライアントで隠しているのではなく、**サーバ側で公開範囲を決めている**（`server/lib/dashboard.ts` の `loadView`、`server/lib/cycles.ts` の `generateCycleInsights`）。

- 相手のスコア・項目・コメントは、ふたりとも回答済み（complete）のときだけ返す
- 共有されていないコメントは相手に渡らない。共有 AI 提案のプロンプトにも入らず、本人の画面と本人のトリアージにだけ使う
- 推移グラフに相手の点が入るのは complete な回だけ

`test/dashboard.test.ts` がこの3点を検証している。ここが落ちたら、テストではなく実装を疑うこと。

## スタック

- **フロントエンド**: React Router v7（SSR）+ Tailwind CSS 4
- **バックエンド**: Hono（Workers 上で `/api/*` を担当）
- **DB**: Cloudflare D1 + Drizzle ORM
- **AI**: Workers AI（binding `AI` / `@cf/meta/llama-3.3-70b-instruct-fp8-fast`）
- **コメント判定**: Jev / TypeSafe System One（`TYPESAFE_API_KEY` 未設定ならスキップして動く）
- **定期実行**: Cron `10 0 * * *` → `scheduled` ハンドラでサイクルの開閉と提案生成
- **テスト**: vitest + @cloudflare/vitest-pool-workers
- **Observability**: Workers Logs / Metrics が既定で ON（`wrangler.jsonc` の `observability`）

## 認証

**Google ログイン**（アプリ内 OAuth。認可コードフロー + PKCE）。`server/auth/` にある。

- セッションは HMAC-SHA256 で署名した httpOnly cookie `cv_session`。サーバ側にセッションストアは持たない
- cookie が持つのはメンバー ID ではなく Google の `sub`。毎リクエスト `sub` で members を引き直すので、DB が唯一の真実になる
- 招待リンク `/s/<token>` は**ログイン手段ではなく、組に参加するための一度きりの参加券**。開いた人が Google ログインすると、そのメンバーに Google アカウントが結びつく（claim）
- 以降はどの端末でも Google ログインだけで入れる
- **メールは使わない**。招待リンクは手渡しで共有する（ドメイン未取得のため、メール配信の検証コストを避けた）
- 1 つの Google アカウントが属せる組は 1 つ
- データはすべて `coupleId` スコープのマルチテナント

### はじめかた

1. 組を作る人が `/` から Google ログインし、`/setup` で組を作る
2. 表示された招待リンクを相手に渡す
3. 相手がリンクを開いて Google ログインすると、その組に参加する

## セットアップ（ローカル開発）

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 空でも動く（Google ログインだけ使えない）
pnpm db:migrate:local            # ローカル D1 にマイグレーション適用
pnpm dev                         # http://localhost:5173
```

- ローカルで Google ログインを試すには `.dev.vars` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` が要る。`SESSION_SECRET` は localhost では未設定でも動く（固定の開発鍵にフォールバックする）
- 招待トークンを直接見るなら:

  ```bash
  pnpm exec wrangler d1 execute DB --local --command "SELECT name, token, google_sub FROM members;"
  ```

## 主なコマンド

| コマンド                                      | 内容                                                           |
| --------------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                                    | ローカル開発サーバー                                           |
| `pnpm typecheck`                              | wrangler types + react-router typegen + tsc                    |
| `pnpm test`                                   | vitest（Workers ランタイム内で実行）                           |
| `pnpm lint` / `pnpm format`                   | Prettier                                                       |
| `pnpm db:generate`                            | db/schema.ts の変更から SQL マイグレーションを生成             |
| `pnpm db:migrate:local` / `db:migrate:remote` | ローカル / リモート D1 にマイグレーション適用                  |
| `pnpm deploy`                                 | build → リモートマイグレーション（predeploy）→ wrangler deploy |
| `pnpm security:ash`                           | ASH セキュリティスキャンをローカルで実行（docker が必要）      |

## ファイルの地図

```
db/schema.ts              couples / members / cycles / responses / answers / insights
server/survey/items.ts    16項目の本文・6件法ラベル・色
server/survey/scoring.ts  scoreOf / computeScores / perceptionGap / lowestItems
server/lib/dashboard.ts   loadView = 公開ルールの本体
server/lib/cycles.ts      サイクルの開閉、個人リンク、提案生成
server/lib/advice.ts      Workers AI で提案を作る（失敗時は FALLBACK）
server/lib/jev.ts         Jev への最小 fetch クライアント（SDK は Workers で動かないので自前）
server/lib/triage.ts      コメントの話題・困り度・トーン判定
server/lib/scheduler.ts   cron から呼ぶ。全 couple を回す
server/api/routes/        setup.ts（未認証）/ survey.ts / cycles.ts
app/routes/               home（今週）/ survey（1問1画面）/ result（みる）/ setup / enter / logout
app/components/           shell.tsx（枠・ヘッダ・タブ・ボタン）charts.tsx（ベン図・推移）
```

## デプロイ

D1 と `vars.APP_URL` は設定済み。main に push すれば `deploy.yml` がマイグレーション適用 → デプロイまで流す。

### Google OAuth の設定（初回だけ）

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で OAuth クライアント（ウェブ アプリケーション）を作る
   - クライアント名は `あいだ (coupvox)` のように、他のアプリと区別できる名前にする
   - OAuth 同意画面のアプリ名は `あいだ`。**これはログイン画面で相手に表示される**
2. 承認済みのリダイレクト URI に両方登録する
   - `https://coupvox.kaito-technology.workers.dev/api/auth/google/callback`
   - `http://localhost:5173/api/auth/google/callback`
3. secret を入れる（対話入力。CLI 引数に値を書かない）

   ```bash
   pnpm exec wrangler versions secret put GOOGLE_CLIENT_ID
   ```

   ```bash
   pnpm exec wrangler versions secret put GOOGLE_CLIENT_SECRET
   ```

   セッションの署名鍵は生成してそのまま流し込む（画面にも履歴にも残さない）:

   ```bash
   openssl rand -base64 32 | pnpm exec wrangler versions secret put SESSION_SECRET
   ```

   `versions secret put` は新しいバージョンを作るだけなので、最後に反映する:

   ```bash
   pnpm exec wrangler versions deploy
   ```

**`SESSION_SECRET` を入れずにデプロイすると、cookie に署名できず誰もログインできない。** `wrangler secret list` で 3 つ揃っているか確認すること。

`TYPESAFE_API_KEY` は使う場合のみ同じ手順で入れる。

GitHub Actions で自動デプロイする場合:

1. Cloudflare ダッシュボードで API トークンを作成（権限: **Workers Scripts: Edit** と **D1: Edit**、対象アカウントを絞る）
   - `deploy.yml` はデプロイ前に `d1 migrations apply --remote` を流すので D1 の権限が要る
2. secrets を登録:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

3. main に push すると `deploy.yml` が自動デプロイ、PR では `preview.yml` がプレビュー URL をコメントする

## エージェント向け

- ルール・MCP・hooks は `.rulesync/` が正本。変更したら `pnpm dlx rulesync generate --targets "*"` で各エージェント設定を再生成する
- MCP: cloudflare-docs（認証不要）/ cloudflare-observability（初回 OAuth）が既定で入っている
- 設計上の決定と未着手タスクは [HANDOFF.md](HANDOFF.md) を参照

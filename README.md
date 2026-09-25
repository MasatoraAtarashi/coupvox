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

パスワードも外部 IdP も置かない。メンバーごとの 32 バイトの推測不能なトークン 1 本で認証する（`server/lib/session.ts`）。

- 個人リンク `/s/<token>` を開くと httpOnly cookie `cv_token` に載り、以降はダッシュボードも開ける
- **メールは使わない**。個人リンクは手渡しで共有する（ドメイン未取得のため、メール配信の検証コストを避けた）
- データはすべて `coupleId` スコープのマルチテナント

## セットアップ（ローカル開発）

```bash
pnpm install
cp .dev.vars.example .dev.vars   # TYPESAFE_API_KEY は空でも動く
pnpm db:migrate:local            # ローカル D1 にマイグレーション適用
pnpm dev                         # http://localhost:5173
```

- 最初に `/setup` で組を作る。作成者の cookie がその場でセットされ、相手用の個人リンク `/s/<token>` が表示される
- トークンを直接見るなら:

  ```bash
  pnpm exec wrangler d1 execute DB --local --command "SELECT name, token FROM members;"
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

初回だけ:

1. `wrangler d1 create coupvox-db` して `wrangler.jsonc` の `database_id` を実 ID に差し替える
2. `pnpm db:migrate:remote`
3. `wrangler secret put TYPESAFE_API_KEY`（使う場合のみ。対話入力で。CLI 引数に値を書かない）
4. `wrangler.jsonc` の `vars.APP_URL` を本番 URL にする（個人リンクの生成に使う）

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

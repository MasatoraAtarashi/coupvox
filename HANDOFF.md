# 引き継ぎ（あいだ / coupvox）

最終更新: 2026-09-25

## これは何か

夫婦・パートナー間の「応答性知覚」を定期的に測って、ふたりだけで見て、対話のきっかけにするアプリ。
アプリ名は **あいだ**（リポジトリ名は coupvox）。

- 2週間に1回、16項目のアンケートが開く（0〜5 の6件法）
- 応答性 8 項目（R1〜R8）と非応答性 8 項目（I1〜I8）。**非応答性は応答性の裏返しではないので、独立した2スコアとして扱う**
- スコアは `round(平均(0〜5) × 20)` で 0〜100
- 自由記述のコメントを1つ添えられる。**共有するかどうかは書いた本人が毎回選ぶ**
- ふたりとも回答して初めて相手の結果が開く（サーバ側で制御）
- Workers AI が「今週試せること」を提案する

## 現状

- ローカルで一周動作確認済み: セットアップ → 個人リンク → 16問 → コメント（共有チェック）→ 結果画面（スコア 68/70、ずれ 2、相手が低くつけた項目、コメント両方開放、AI 提案生成）
- `pnpm exec tsc -b` 通過
- `pnpm test` 21 passed / 4 files（AI 提案のプロンプト調整後に再実行済み）
- main を push 済み。CI（PR Checks / Deploy）ともに green
- デプロイ済み: https://coupvox.kaito-technology.workers.dev
- D1 `coupvox-db`（APAC / `d3510429-0f80-4374-bc35-2582fbb5449c`）。リモートのマイグレーション適用済み

## 技術構成

- Cloudflare Workers + React Router v7（SSR）+ Hono
- D1 + Drizzle ORM（`migrations/0000_init.sql` の1本のみ）
- Workers AI（binding `AI`、`@cf/meta/llama-3.3-70b-instruct-fp8-fast`）
- Jev / TypeSafe System One（コメントの高速判定）。`TYPESAFE_API_KEY` 未設定なら判定をスキップして動く
- Cron `"10 0 * * *"` → `scheduled` ハンドラでサイクルの開閉と提案生成
- テスト: vitest + `@cloudflare/vitest-pool-workers`

## 決まっていること（変更する前に理由を確認する）

| 項目         | 決定                                                             | 理由                                                         |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| 通知手段     | **メールを使わない**。個人リンクを手渡しで共有                   | ドメイン未取得。メール配信の検証コストを避けた               |
| コメント共有 | **書いた本人が毎回選ぶ**（`responses.shareComment`）             | 共有しない前提でないと本音が書けない                         |
| AI           | **Workers AI（無料枠）**                                         | 外部 API キー不要で動かせる                                  |
| テナント     | **マルチテナント**（すべて `coupleId` スコープ）                 | あとで他の人にも配る想定                                     |
| 認証         | **Google ログイン**（アプリ内 OAuth + PKCE）。招待リンクは参加券 | 端末をまたげる。リンクを控えていないとスマホで見られなかった |

## プライバシーの決まり（壊さないこと）

サーバ側（`server/lib/dashboard.ts` の `loadView`、`server/lib/cycles.ts` の `generateCycleInsights`）で強制している。クライアントで隠しているのではない。

- 相手のスコア・項目・コメントは、**ふたりとも回答済み（complete）のときだけ**返す
- 共有されていないコメントは、相手に渡らない／共有 AI 提案のプロンプトにも入らない。本人の画面と本人の Jev 判定にだけ使う
- 推移グラフに相手の点が入るのは complete な回だけ

`test/dashboard.test.ts` がこの3点を検証している。**ここを壊す変更はテストが落ちる。落ちたらテストではなく実装を疑う**

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
server/auth/              google-oauth.ts（PKCE）/ session.ts（署名cookie）/ member.ts（claim）/ routes.ts
server/api/routes/        setup.ts（要ログイン）/ survey.ts / cycles.ts
app/routes/               home（今週）/ survey（1問1画面）/ result（みる）/ setup / enter / logout
app/components/           shell.tsx（枠・ヘッダ・タブ・ボタン）charts.tsx（ベン図・推移）
```

## 開発

```bash
pnpm install
cp .dev.vars.example .dev.vars   # TYPESAFE_API_KEY は空でも動く
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev                          # http://localhost:5173
```

- `/` から Google ログイン → `/setup` で組を作る → 表示された招待リンクを相手に渡す
- ローカルで Google ログインを試すには `.dev.vars` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` が要る
- 招待トークンを直接見るなら: `pnpm exec wrangler d1 execute DB --local --command "SELECT name, token, google_sub FROM members;"`
- 検証: `pnpm exec tsc -b` と `pnpm test`

## デプロイ

初回セットアップは完了済み。main に push すれば `deploy.yml` が
マイグレーション適用 → デプロイまで流す。

- GitHub secrets: `CLOUDFLARE_API_TOKEN`（**Workers Scripts: Edit と D1: Edit の両方が要る**）/ `CLOUDFLARE_ACCOUNT_ID`
- `wrangler-action` は `command` をそのまま実行し `package.json` の `predeploy` を
  経由しない。マイグレーションは `deploy.yml` の専用ステップで流している
- `TYPESAFE_API_KEY` を使う場合のみ `wrangler secret put TYPESAFE_API_KEY`（対話入力で）

## 残っていること

- [ ] **既存の2人が、手元の招待リンクで claim できるか本番で確認する**（未 claim のまま残っている）
- [ ] 本番で一周の動作確認（`/setup` から組を作って16問まで）。ローカルでしか通していない
- [ ] Dependabot が開いている PR（vite / react / wrangler ほか）の取り込み
- [ ] R4〜R8 / I4〜I8 の文言は暫定。R1〜R3・I1〜I3 は支給された正式な文言なので変えない（`test/scoring.test.ts` が固定している）
- [ ] 複数サイクルにまたがる推移グラフは、実データが1回分しかないので未検証

## 直近で直したこと

- `deploy.yml` がマイグレーションを流しておらず、デプロイは success なのに
  リモート D1 のテーブルが `_cf_KV` だけだった。専用ステップを足した
- `pnpm audit` が high 6 / moderate 6 で CI を落としていた。hono を 4.13.9 に
  上げ（本番依存で唯一の該当）、推移的依存は `pnpm.overrides` で固定した

- Workers AI の `response` が文字列ではなくオブジェクトで返ることがあり、`raw.replace is not a function` で必ず FALLBACK に落ちていた。`parseAdvice(raw: unknown)` で両方受けるようにした（`server/lib/advice.ts`）
- 提案が長文・尺度名まじりになっていたので、プロンプトに文字数（40〜80字）と「です・ます」「尺度名を書かない」を足した

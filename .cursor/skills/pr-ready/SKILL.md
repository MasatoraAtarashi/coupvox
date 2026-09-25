---
name: pr-ready
description: push して CI を監視し、失敗を修正して PR をマージ可能な状態まで持っていく。実装完了後・「PR を出せる状態にして」「CI を直して」と言われた時に使用。
---
# pr-ready

実装完了から「CI が緑の PR」までを自走する手順。失敗したら回避せず原因を直すこと。

## 手順

1. `git status` と `git diff` で未コミットの変更を確認する。必要なら Conventional Commits 形式でコミットする
2. `git pull --rebase origin main` で main と同期する（コンフリクトしたら解消する）
3. ローカルで `pnpm typecheck` と `pnpm test` を実行し、失敗があれば修正する
4. `git push` する（ブランチ未 push なら `git push -u origin HEAD`）
5. PR がなければ `gh pr create` で作成する（タイトルは Conventional Commits 準拠、本文に変更概要を書く）
6. `gh run watch` で CI を監視する
7. CI が失敗したら `gh run view <run-id> --log-failed` でログを読み、ローカルで再現・修正して 4 に戻る
8. CI が緑になったら、`git diff origin/main...HEAD` を見直し、明らかな問題（secrets・未使用コード・型エラー）がないか確認する
9. 結果を報告する: PR URL / CI 状態 / 変更の要点

## 禁止事項

- `--no-verify` でのフック回避
- CI の失敗をワークフロー改変で黙らせる（正当な理由がある場合を除く。その場合は理由を明記する）
- 他人のレビューなしでの main 直 push

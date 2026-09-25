---
name: self-review
description: origin/main との差分を P1/P2/P3 で自己レビューし、P1 はそのまま修正する。「レビューして」「マージ前に確認して」と言われた時に使用。
---

# self-review

`git diff origin/main...HEAD` の全変更を、CI と同じ観点でレビューする。

## レビュー観点

1. **P1（マスト修正）**: バグ / セキュリティ（secrets のハードコード・バリデーション欠落・`--no-verify` などの回避）/ 型エラー / テスト不足 / wrangler ルール違反（rules/cloudflare.md 参照）
2. **P2（推奨修正）**: エラーハンドリング不足 / 命名 / 重複コード / ドキュメント不足
3. **P3（参考）**: スタイル / 軽微な改善

## 手順

1. `git fetch origin` してから `git diff origin/main...HEAD` を取得する
2. 変更ファイルを 1 つずつ上記の観点でレビューする
3. 指摘は「ファイル:行 / 重要度（P1-P3）/ 理由 / 修正案」の形式で列挙する
4. P1 が 1 件以上ある場合は、続けて修正まで実施し、再度 typecheck / test を実行する
5. P1 がゼロになったら完了を報告する

---
description: push して CI を監視し、失敗を修正して PR をマージ可能な状態にする
---

以下の手順で PR を「CI pass」の状態まで持っていってください。

1. `git status` と `git diff` で未コミットの変更を確認し、必要ならコミットする
2. `git push` する（リモートブランチがなければ `git push -u origin HEAD`）
3. `gh run watch` で CI を監視する
4. CI が失敗したらログを読み、ローカルで再現・修正して 1 に戻る
5. CI が緑になったら、変更概要と CI 結果を報告する

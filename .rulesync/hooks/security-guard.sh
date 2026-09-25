#!/bin/sh
# squat 共通ハーネス: エージェント用 PreToolUse セキュリティガード（軽量 1 本）
# stdin のフック JSON をパターンマッチし、危険な操作だけを阻止する。
# 終了コード 2 = 阻止（stderr がエージェントに返る）。それ以外 = 通過。

input=$(cat)

# 1) git の --no-verify（フック回避）を阻止
case "$input" in
  *"--no-verify"*)
    case "$input" in
      *"git commit"* | *"git push"*)
        echo "BLOCKED: --no-verify による git hooks の回避は禁止です。フックが失敗している場合は、回避せずに原因を修正してください。" >&2
        exit 2
        ;;
    esac
    ;;
esac

# 2) secret 値を CLI 引数に直接載せる操作を警告（ブロックはしない）
case "$input" in
  *"wrangler secret put"*)
    echo "NOTE: secret を CLI 引数で渡すとシェル履歴に残ります。可能なら 'wrangler secret put <NAME>' の対話入力を使ってください。" >&2
    ;;
esac

exit 0

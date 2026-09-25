import { describe, expect, it } from "vitest";
import { isExternalHref } from "../app/lib/href";

/**
 * Google ログインのボタンが押しても 404 になっていた事故の回帰テスト。
 * 原因は /api/auth/google を React Router の <Link> に渡していたことで、
 * クライアント側ルーティングが「そんなルートは無い」と判断し、
 * リクエストが Worker まで届いていなかった。
 */
describe("アプリ外への遷移の判定", () => {
  it("Worker 側の /api/* はページごと遷移させる", () => {
    expect(isExternalHref("/api/auth/google?next=%2Fsetup")).toBe(true);
    expect(isExternalHref("/api/auth/logout")).toBe(true);
  });

  it("外部 URL もページごと遷移させる", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("mailto:a@example.com")).toBe(true);
  });

  it("アプリ内のルートは React Router に任せる", () => {
    for (const path of ["/", "/setup", "/survey", "/result", "/s/abc"]) {
      expect(isExternalHref(path)).toBe(false);
    }
  });

  it("/api で始まるだけのアプリ内ルートは巻き込まない", () => {
    // 「/api」を含むが別ルートであるものを <a> にしてしまうと SPA 遷移が壊れる
    expect(isExternalHref("/apikeys")).toBe(false);
  });
});

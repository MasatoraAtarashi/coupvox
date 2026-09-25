import type { Member } from "../db/schema";

// Hono アプリの環境型（Bindings は worker-configuration.d.ts の Env を使用）
export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    member: Member;
  };
};

declare global {
  interface Env {
    /** Jev（TypeSafe System One）の API キー。未設定ならトリアージをスキップする */
    TYPESAFE_API_KEY?: string;
    /** 個人リンクを組み立てるときの公開 URL（例: https://coupvox.example.workers.dev） */
    APP_URL?: string;
  }
}

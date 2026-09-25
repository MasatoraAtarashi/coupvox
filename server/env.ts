import type { Member } from "../db/schema";
import type { SessionPayload } from "./auth/session";

// Hono アプリの環境型（Bindings は worker-configuration.d.ts の Env を使用）
export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    member: Member;
    /** requireSession が入れる。memberAuth を通る経路では member を使う */
    session: SessionPayload;
  };
};

declare global {
  interface Env {
    /** Jev（TypeSafe System One）の API キー。未設定ならトリアージをスキップする */
    TYPESAFE_API_KEY?: string;
    /** 招待リンクを組み立てるときの公開 URL（例: https://coupvox.example.workers.dev） */
    APP_URL?: string;
    /** Google OAuth クライアント（Google Cloud Console で発行） */
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    /** セッション cookie の署名鍵。本番で未設定だと誰もログインできない */
    SESSION_SECRET?: string;
  }
}

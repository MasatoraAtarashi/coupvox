import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    // Roboto 500 は Google のボタンのガイドライン指定（Google Sans が無い環境の代替）
    href: "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&family=Roboto:wght@500&display=swap",
  },
];

export const meta: Route.MetaFunction = () => [
  { title: "あいだ" },
  { name: "description", content: "ふたりの見え方の差に気づくための記録" },
  { name: "robots", content: "noindex, nofollow" },
  { name: "theme-color", content: "#F3EADF" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="font-sans">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "エラーが起きました";
  let details = "時間をおいて、もう一度ひらいてみてください。";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "ページが見つかりません" : "エラー";
    details =
      error.status === 404
        ? "リンクをご確認ください。個人リンクはひとりずつ別のものです。"
        : (error.statusText ?? details);
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }

  return (
    <div className="flex min-h-screen justify-center bg-[var(--color-page)]">
      <main className="w-full max-w-[460px] bg-[var(--color-app)] px-5 py-20">
        <div className="text-[22px] font-bold">{message}</div>
        <p className="mt-3 text-[14px] leading-[1.95] text-[var(--color-ink-sub)]">{details}</p>
      </main>
    </div>
  );
}

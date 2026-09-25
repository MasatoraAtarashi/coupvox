import { redirect } from "react-router";
import { createDb } from "../../db/client";
import { claimInvite } from "../../server/auth/member";
import { readSessionFromRequest } from "../../server/auth/session";
import { AppShell, Card, Header, PrimaryButton } from "../components/shell";
import type { Route } from "./+types/enter";

/**
 * 招待リンク（/s/:token）の入口。
 *
 * リンクはログイン手段ではなく「組に参加するための一度きりの参加券」。
 * 未ログインならまず Google へ送り、戻ってきたところでこのアカウントを
 * メンバーに結びつける。トークンを cookie に載せないのは、載せた時点で
 * 「リンクを持っている＝本人」という旧方式に戻ってしまうため。
 */
export async function loader({ context, params, request }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await readSessionFromRequest(request, env);
  if (!session) {
    const next = encodeURIComponent(`/s/${params.token}`);
    return redirect(`/api/auth/google?next=${next}`);
  }

  const result = await claimInvite(createDb(env.DB), params.token, session);
  if (result.ok) return redirect("/");
  if (result.reason === "not_found") {
    throw new Response("リンクが無効です", { status: 404 });
  }
  return { reason: result.reason };
}

const MESSAGES: Record<string, { title: string; body: string }> = {
  already_claimed: {
    title: "このリンクはもう使われています",
    body: "別のアカウントが、このリンクで組に参加しています。心当たりがなければ、リンクを渡してくれた人に確認してください。",
  },
  account_in_use: {
    title: "このアカウントは別の組にいます",
    body: "ひとつの Google アカウントで入れる組はひとつだけです。いまの組から抜けるか、別のアカウントでログインしてください。",
  },
};

export default function Enter({ loaderData }: Route.ComponentProps) {
  const message = MESSAGES[loaderData.reason] ?? {
    title: "参加できませんでした",
    body: "時間をおいて、もう一度ひらいてみてください。",
  };

  return (
    <AppShell>
      <Header />
      <div className="a-in px-5 pt-10">
        <Card className="px-6 py-[26px]">
          <div className="text-[22px] font-bold">{message.title}</div>
          <p className="mt-3 text-[14px] leading-[1.9] text-[var(--color-ink-sub)]">
            {message.body}
          </p>
          <div className="mt-5">
            <PrimaryButton href="/">はじめに戻る</PrimaryButton>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

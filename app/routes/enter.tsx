import { redirect } from "react-router";
import { createDb } from "../../db/client";
import { findMemberByToken, isSecureRequest, sessionCookie } from "../../server/lib/session";
import type { Route } from "./+types/enter";

/**
 * メールの個人リンク（/s/:token）の入口。
 * トークンを Cookie に載せ替えて、URL からは消す（履歴や共有で漏れないように）。
 */
export async function loader({ context, params, request }: Route.LoaderArgs) {
  const member = await findMemberByToken(createDb(context.cloudflare.env.DB), params.token);
  if (!member) {
    throw new Response("リンクが無効です", { status: 404 });
  }
  return redirect("/survey", {
    headers: { "set-cookie": sessionCookie(member.token, isSecureRequest(request.url)) },
  });
}

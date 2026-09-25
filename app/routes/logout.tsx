import { redirect } from "react-router";
import { clearSessionCookieHeader, isLocalRequest } from "../../server/auth/session";
import type { Route } from "./+types/logout";

/** 共用端末で見たあとに Cookie を消すための出口 */
export async function loader({ request }: Route.LoaderArgs) {
  return redirect("/", {
    headers: { "set-cookie": clearSessionCookieHeader(!isLocalRequest(request.url)) },
  });
}

import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("setup", "routes/setup.tsx"),
  route("survey", "routes/survey.tsx"),
  route("result", "routes/result.tsx"),
  // メールの個人リンク: Cookie を張って回答画面へ送る
  route("s/:token", "routes/enter.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;

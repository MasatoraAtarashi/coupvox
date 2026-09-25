import { useLoaderData, useSearchParams } from "react-router";
import { AppShell, Card, Header, PrimaryButton, SecondaryButton, Tabs } from "../components/shell";
import { GoogleSignInButton } from "../components/google-sign-in";
import { loginErrorMessage } from "../lib/login-error";
import { loadView } from "../../server/lib/dashboard";
import { memberFromRequest } from "../../server/auth/member";
import { readSessionFromRequest } from "../../server/auth/session";
import { SURVEY_ITEMS } from "../../server/survey/items";
import type { Route } from "./+types/home";

export async function loader({ context, request }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  // ログイン済みでも、まだどの組にも属していないことがある（組を作る前／招待リンクを踏む前）
  const signedIn = Boolean(await readSessionFromRequest(request, env));
  const me = await memberFromRequest(env, request);
  if (!me) return { authorized: false as const, signedIn };

  const view = await loadView(env.DB, me, env.APP_URL ?? new URL(request.url).origin);
  if (!view) return { authorized: false as const, signedIn };
  return { authorized: true as const, view, itemCount: SURVEY_ITEMS.length };
}

export default function Home() {
  const loaded = useLoaderData<typeof loader>();

  if (!loaded.authorized) return <Landing signedIn={loaded.signedIn} />;

  const { view, itemCount } = loaded;
  const canAnswer = Boolean(view.openCycleId) && !view.meDone;

  return (
    <AppShell withTabs>
      <Header weekRange={view.weekRange} />

      <div className="a-in px-5 pt-5 pb-10">
        <Card className="px-6 py-[26px]">
          <h1 className="text-[24px] font-bold leading-[1.6] text-pretty">
            この2週間の、
            <br />
            ふたりについて。
          </h1>
          <p className="mt-3 text-[14px] leading-[1.9] text-[var(--color-ink-sub)]">
            {itemCount}個の質問に0〜5でこたえるだけ。ひとことも書けます。だいたい60秒。
          </p>
          <div className="mt-5">
            {canAnswer ? (
              <PrimaryButton href="/survey">回答する（約60秒）</PrimaryButton>
            ) : (
              <PrimaryButton href="/result">結果を見る</PrimaryButton>
            )}
          </div>
          {canAnswer && (
            <div className="mt-2.5">
              <SecondaryButton href="/result">結果を見る</SecondaryButton>
            </div>
          )}
        </Card>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <StatusCard
            tint="var(--color-coral-tint)"
            dot="var(--color-coral)"
            label="あなた"
            done={view.meDone}
            pendingColor="var(--color-coral-text)"
          />
          <StatusCard
            tint="var(--color-peri-tint)"
            dot="var(--color-peri)"
            label="パートナー"
            done={view.partnerDone}
            pendingColor="var(--color-peri-deep)"
          />
        </div>

        <Card className="mt-3.5 px-6 pt-[22px] pb-6">
          <div className="text-[13px] text-[var(--color-ink-sub)]">先週のふたり</div>
          <div className="mt-3.5 flex items-center gap-5">
            <LastScore
              value={view.lastMeResponsive}
              color="var(--color-coral-big)"
              caption="あなたが感じた"
            />
            <LastScore
              value={view.lastPartnerResponsive}
              color="var(--color-peri-deep)"
              caption="相手が感じた"
            />
          </div>
        </Card>

        {!view.partnerDone && view.partnerLink && (
          <details className="mt-3.5 rounded-[22px] bg-[var(--color-panel)] px-[18px] py-4">
            <summary className="cursor-pointer text-[12px] text-[var(--color-ink-sub)]">
              {view.partnerName} さんのリンクを確認する
            </summary>
            <p className="mt-2 text-[12px] leading-[1.8] text-[var(--color-ink-sub)]">
              まだ渡していなければ、これを送ってください。ひらいた端末がそのまま
              {view.partnerName} さんのものになります。
            </p>
            <input
              readOnly
              value={view.partnerLink.url}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-2.5 w-full rounded-lg bg-white px-3 py-2 font-mono text-[11px]"
            />
          </details>
        )}

        <p className="mt-6 text-center text-[12px] leading-[2] text-[var(--color-ink-sub)]">
          この記録はふたりだけが見られます。
          <br />
          点数を上げるための指標ではありません。
        </p>
      </div>

      <Tabs active="home" />
    </AppShell>
  );
}

function StatusCard({
  tint,
  dot,
  label,
  done,
  pendingColor,
}: {
  tint: string;
  dot: string;
  label: string;
  done: boolean;
  pendingColor: string;
}) {
  return (
    <div className="rounded-[22px] px-[18px] pt-[18px] pb-5" style={{ background: tint }}>
      <div className="flex items-center gap-[7px]">
        <span className="block size-2.5 rounded-full" style={{ background: dot }} />
        <span className="text-[13px] font-medium">{label}</span>
      </div>
      <div
        className="mt-3 text-[14px] font-bold"
        style={{ color: done ? "var(--color-ink-muted)" : pendingColor }}
      >
        {done ? "回答ずみ" : "未回答"}
      </div>
    </div>
  );
}

function LastScore({
  value,
  color,
  caption,
}: {
  value: number | null;
  color: string;
  caption: string;
}) {
  return (
    <div className="flex-1">
      <div className="tnum text-[44px] leading-none font-bold" style={{ color }}>
        {value === null ? "—" : value}
      </div>
      <div className="mt-2 text-[12px] text-[var(--color-ink-sub)]">{caption}</div>
    </div>
  );
}

function Landing({ signedIn }: { signedIn: boolean }) {
  const [params] = useSearchParams();
  const loginError = loginErrorMessage(params.get("error"));
  return (
    <AppShell>
      <Header />
      <div className="a-in px-5 pt-10 pb-10">
        <Card className="px-6 py-[26px]">
          <h1 className="text-[24px] font-bold leading-[1.6] text-pretty">
            ふたりの見え方の差に、
            <br />
            気づくために。
          </h1>
          <p className="mt-3 text-[14px] leading-[1.9] text-[var(--color-ink-sub)]">
            「聴いてもらえた」「分かってもらえた」という感覚を16個の質問ではかります。
            記録はふたりだけが見られます。
          </p>
          {signedIn ? (
            <>
              <p className="mt-4 text-[14px] leading-[1.9] text-[var(--color-ink-sub)]">
                ログインできています。組を作るか、相手から届いた招待リンクをひらいてください。
              </p>
              <div className="mt-5">
                <PrimaryButton href="/setup">ふたりではじめる</PrimaryButton>
              </div>
            </>
          ) : (
            <div className="mt-5">
              {loginError && (
                <p className="mb-3 rounded-2xl bg-[var(--color-panel)] px-4 py-3 text-[13px] leading-[1.8] text-[var(--color-ink-sub)]">
                  {loginError}
                </p>
              )}
              <GoogleSignInButton next="/setup" />
            </div>
          )}
        </Card>
        <p className="mt-6 text-center text-[12px] leading-[2] text-[var(--color-ink-sub)]">
          {signedIn
            ? "招待リンクをひらくと、いまのアカウントでその組に参加します。"
            : "すでに使っている場合も、同じ Google アカウントでログインしてください。"}
        </p>
      </div>
    </AppShell>
  );
}

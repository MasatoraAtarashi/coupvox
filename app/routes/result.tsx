import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { Legend, TrendChart, VennHero } from "../components/charts";
import { AppShell, Card, Header, PrimaryButton, Tabs } from "../components/shell";
import { loadView } from "../../server/lib/dashboard";
import { memberFromRequest } from "../../server/lib/session";
import { SECTION_TITLES } from "../../server/lib/advice";
import type { Route } from "./+types/result";

export async function loader({ context, request }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const me = await memberFromRequest(env.DB, request);
  if (!me) return { authorized: false as const };

  const view = await loadView(env.DB, me, env.APP_URL ?? new URL(request.url).origin);
  if (!view) return { authorized: false as const };
  return { authorized: true as const, view };
}

export default function Result() {
  const loaded = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [metric, setMetric] = useState<"R" | "I">("R");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  if (!loaded.authorized) {
    return (
      <AppShell>
        <Header />
        <div className="a-in px-5 pt-10">
          <Card className="px-6 py-[26px]">
            <div className="text-[22px] font-bold">自分のリンクをひらいてください</div>
            <p className="mt-3 text-[14px] leading-[1.9] text-[var(--color-ink-sub)]">
              記録はふたりだけが見られます。
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }

  const { view } = loaded;

  async function refreshAdvice() {
    setAdviceLoading(true);
    try {
      const res = await fetch("/api/cycles/advice", { method: "POST" });
      setAdviceError(
        res.ok ? null : "いまはつくれませんでした。回答を送ってから、もう一度おしてください。",
      );
    } catch {
      setAdviceError("通信できませんでした。少し待ってからもう一度おしてください。");
    } finally {
      setAdviceLoading(false);
      revalidator.revalidate();
    }
  }

  // 旧ペイロード（mode / sections を持たない）は paired 扱いで読む
  const adviceMode = view.advice?.mode ?? "paired";
  const adviceSections = view.advice?.sections ?? [];

  const pill = (on: boolean) =>
    on ? "bg-[var(--color-ink)] text-white" : "bg-[var(--color-track)] text-[#6B6057]";

  return (
    <AppShell withTabs>
      <Header weekRange={view.weekRange} />

      <div className="a-in px-5 pt-4 pb-10">
        {view.safetyConcern && (
          <Card className="mb-3.5 px-6 py-5" radius={28}>
            <div className="text-[14px] font-bold text-[var(--color-coral-text)]">
              ひとりで抱えないでください
            </div>
            <p className="mt-2 text-[13px] leading-[1.9] text-[var(--color-ink-sub)]">
              怖さや身の危険を感じているときは、相談できる場所があります。DV相談ナビ #8008、
              よりそいホットライン 0120-279-338。緊急のときは 110 番。
            </p>
          </Card>
        )}

        {/* a. Vennヒーロー */}
        <Card className="px-6 pt-6 pb-[26px]" radius={28}>
          <div className="text-[13px] text-[var(--color-ink-sub)]">今週のふたり</div>
          <VennHero me={view.meResponsive} partner={view.partnerResponsive} gap={view.gap} />
          <Legend />
          <div className="mt-[18px] rounded-[18px] bg-[var(--color-panel)] px-[18px] py-3.5 text-center text-[14px] leading-[1.7] text-[var(--color-ink-muted)]">
            ふたりの見え方のずれ{" "}
            <span className="tnum text-[17px] font-bold text-[var(--color-ink)]">
              {view.gap === null ? "—" : view.gap}
            </span>
          </div>
          {!view.meDone && view.openCycleId && (
            <div className="mt-4">
              <PrimaryButton href="/survey">回答する（約60秒）</PrimaryButton>
            </div>
          )}
        </Card>

        {/* b. 推移 */}
        <Card className="mt-3.5 px-5 pt-[22px] pb-[18px]" radius={28}>
          <div className="flex items-center justify-between px-1">
            <div className="text-[13px] text-[var(--color-ink-sub)]">
              {view.trend.length}回の推移
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMetric("R")}
                className={`rounded-full px-3.5 py-2 text-[12px] font-medium ${pill(metric === "R")}`}
              >
                応答性
              </button>
              <button
                type="button"
                onClick={() => setMetric("I")}
                className={`rounded-full px-3.5 py-2 text-[12px] font-medium ${pill(metric === "I")}`}
              >
                非応答性
              </button>
            </div>
          </div>
          {view.trend.length > 0 ? (
            <TrendChart points={view.trend} metric={metric} />
          ) : (
            <p className="px-1 py-8 text-center text-[13px] text-[var(--color-ink-sub)]">
              回答がたまると、ここに推移が出ます。
            </p>
          )}
        </Card>

        {/* c. 相手が低くつけた項目 */}
        {view.lowItems.length > 0 && (
          <Card className="mt-3.5 p-6" radius={28}>
            <div className="text-[13px] text-[var(--color-ink-sub)]">相手が低くつけた項目</div>
            <div className="mt-4 grid gap-3">
              {view.lowItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3.5">
                  <div className="tnum flex size-11 flex-none items-center justify-center rounded-full bg-[var(--color-peri-tint)] text-[18px] font-bold text-[var(--color-peri-deep)]">
                    {item.score}
                  </div>
                  <div className="text-[14px] leading-[1.75] text-pretty">{item.text}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* d. コメント */}
        <div className="mt-[26px] pl-1.5 text-[13px] text-[var(--color-ink-sub)]">
          今週のコメント
        </div>
        {view.complete ? (
          <div className="mt-3 grid gap-3">
            <div className="rounded-[24px] rounded-tl-[8px] bg-[var(--color-peri-tint)] px-[22px] py-5">
              <div className="text-[12px] font-medium text-[var(--color-peri-deep)]">
                {view.partnerName}
              </div>
              <p className="mt-2 text-[14px] leading-[1.95] text-pretty">
                {view.partnerComment ??
                  (view.partnerCommentWithheld
                    ? "（共有しない設定で書かれています）"
                    : "（コメントなし）")}
              </p>
            </div>
            <div className="rounded-[24px] rounded-tr-[8px] bg-[var(--color-coral-tint)] px-[22px] py-5">
              <div className="text-[12px] font-medium text-[var(--color-coral-text)]">あなた</div>
              <p className="mt-2 text-[14px] leading-[1.95] text-pretty">
                {view.myComment ?? "（コメントなし）"}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-[24px] bg-[var(--color-panel)] px-[18px] py-[26px] text-center text-[14px] text-[var(--color-ink-sub)]">
            ふたりとも回答すると開きます
          </div>
        )}

        {/* e. AI分析。相手を待たず、自分が答えた時点で開く */}
        {view.meDone && (
          <section className="mt-[26px] rounded-[28px] bg-[var(--color-amber-card)] p-6">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-medium text-[var(--color-amber-label)]">
                {adviceMode === "solo" ? "いまのあなたへ" : "AIからの分析"}
              </div>
              <button
                type="button"
                onClick={refreshAdvice}
                disabled={adviceLoading}
                className="rounded-full border-none bg-white/70 px-3.5 py-[7px] text-[12px] text-[var(--color-amber-label)]"
              >
                {adviceLoading ? "考えています…" : "更新する"}
              </button>
            </div>
            {view.advice ? (
              <>
                <p className="mt-3.5 text-[15px] leading-[1.9] font-medium text-[var(--color-amber-ink)] text-pretty">
                  {view.advice.lead}
                </p>
                {adviceSections.length > 0 && (
                  <div className="mt-4 grid gap-2.5">
                    {adviceSections.map((section) => (
                      <div key={section.key} className="rounded-[18px] bg-white/60 px-[18px] py-4">
                        <div className="text-[12px] font-medium text-[var(--color-amber-label)]">
                          {SECTION_TITLES[adviceMode][section.key]}
                        </div>
                        <p className="mt-1.5 text-[14px] leading-[1.85] text-[var(--color-amber-ink)] text-pretty">
                          {section.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 grid gap-2.5">
                  {view.advice.lines.map((line, index) => (
                    <div
                      key={`${index}-${line.slice(0, 12)}`}
                      className="rounded-[18px] bg-white px-[18px] py-4 text-[14px] leading-[1.85] text-[var(--color-amber-ink)] text-pretty"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3.5 text-[14px] leading-[1.9] text-[var(--color-amber-ink)]">
                「更新する」をおすと、今回の結果から分析をつくります。
              </p>
            )}
            {adviceError && (
              <p className="mt-3 text-[13px] leading-[1.85] text-[var(--color-amber-label)]">
                {adviceError}
              </p>
            )}
            {adviceMode === "solo" && (
              <p className="mt-3 text-[12px] leading-[1.9] text-[var(--color-amber-label)]">
                {view.partnerName}
                さんが回答すると、相手からの見え方をもとにした分析に切り替わります。
              </p>
            )}
          </section>
        )}

        <p className="mt-[26px] text-center text-[12px] leading-[2] text-[var(--color-ink-sub)]">
          この記録はふたりだけが見られます。
          <br />
          点数を上げるための指標ではありません。
        </p>
      </div>

      <Tabs active="result" />
    </AppShell>
  );
}

import { useRef, useState } from "react";
import { redirect, useLoaderData, useNavigate } from "react-router";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../db/client";
import { responses } from "../../db/schema";
import { AppShell, Card, PrimaryButton } from "../components/shell";
import { getMembers, getOpenCycle, rangeLabel } from "../../server/lib/cycles";
import { memberFromRequest } from "../../server/lib/session";
import { SCALE_LABELS, SCALE_TINTS, SURVEY_ITEMS } from "../../server/survey/items";
import type { Route } from "./+types/survey";

export async function loader({ context, request }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const db = createDb(env.DB);

  const me = await memberFromRequest(env.DB, request);
  if (!me) throw redirect("/");

  const roster = await getMembers(db, me.coupleId);
  const partner = roster.find((candidate) => candidate.id !== me.id);
  const cycle = await getOpenCycle(db, me.coupleId);
  if (!cycle) throw redirect("/result");

  const [existing] = await db
    .select()
    .from(responses)
    .where(and(eq(responses.cycleId, cycle.id), eq(responses.memberId, me.id)))
    .limit(1);
  if (existing) throw redirect("/result");

  return {
    cycleId: cycle.id,
    weekRange: rangeLabel(cycle),
    partnerName: partner?.name ?? "パートナー",
    items: SURVEY_ITEMS,
  };
}

type Screen = "survey" | "comment" | "thanks";

export default function Survey() {
  const { cycleId, partnerName, items } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>("survey");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [shareComment, setShareComment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partnerDone, setPartnerDone] = useState(false);
  // 連打対策。タイマー完了フラグ方式はタブが裏に回ると固まるので時刻で見る
  const lockAt = useRef(0);

  const item = items[Math.min(idx, items.length - 1)];
  const selected = answers[item.id];

  function pick(value: number) {
    if (Date.now() - lockAt.current < 160) return;
    const next = { ...answers, [item.id]: value };
    setAnswers(next);
    if (idx >= items.length - 1) {
      setScreen("comment");
      return;
    }
    lockAt.current = Date.now();
    setTimeout(() => setIdx((prev) => Math.min(prev + 1, items.length - 1)), 160);
  }

  function back() {
    lockAt.current = 0;
    if (idx === 0) {
      navigate("/");
      return;
    }
    setIdx((prev) => prev - 1);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cycleId, answers, comment, shareComment }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          body.error === "already_submitted"
            ? "この回はすでに回答ずみです。"
            : "送信できませんでした。もう一度ためしてください。",
        );
      }
      const body = (await res.json()) as { partnerDone: boolean };
      setPartnerDone(body.partnerDone);
      setScreen("thanks");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "送信できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "thanks") {
    return (
      <AppShell>
        <div className="a-in px-5 pt-[60px] pb-10 text-center">
          <svg width="150" height="92" viewBox="0 0 150 92" className="a-pop mx-auto block">
            <circle cx="60" cy="46" r="42" fill="#F2846B" fillOpacity="0.85" />
            <circle
              cx="90"
              cy="46"
              r="42"
              fill="#8C93DB"
              fillOpacity="0.75"
              style={{ mixBlendMode: "multiply" }}
            />
          </svg>
          <div className="mt-[26px] text-[22px] font-bold">送信しました</div>
          <p className="mt-3 text-[14px] leading-[1.95] text-[var(--color-ink-sub)]">
            {partnerDone
              ? "ふたりとも回答しました。コメントが開きます。"
              : "相手が回答すると、結果とコメントが開きます。"}
          </p>
          <div className="mt-7">
            <PrimaryButton href="/result">結果を見る</PrimaryButton>
          </div>
          <div className="mt-2.5">
            <a
              href="/"
              className="block w-full rounded-full py-3.5 text-center text-[14px] text-[var(--color-ink-sub)]"
            >
              ホームへ
            </a>
          </div>
        </div>
      </AppShell>
    );
  }

  if (screen === "comment") {
    return (
      <AppShell>
        <div className="a-in px-5 pt-5 pb-10">
          <Card className="px-6 py-[26px]" radius={28}>
            <div className="text-[22px] font-bold">ひとこと、あれば。</div>
            <p className="mt-2.5 text-[13px] leading-[1.9] text-[var(--color-ink-sub)]">
              任意です。ふたりとも回答すると相手に開きます。
            </p>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
              placeholder="例：忙しいのに話を聞いてくれてありがとう。"
              className="mt-4 min-h-[150px] w-full resize-y rounded-[20px] border-none bg-[var(--color-panel)] p-[18px] text-[15px] leading-[1.9] text-[var(--color-ink)] outline-none"
            />
            <label className="mt-3 flex items-start gap-3 rounded-[20px] bg-[var(--color-panel)] px-[18px] py-4">
              <input
                type="checkbox"
                checked={shareComment}
                onChange={(event) => setShareComment(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-coral-deep)]"
              />
              <span className="text-[13px] leading-[1.8]">
                このひとことを {partnerName} さんにも見せる
                <span className="mt-1 block text-[12px] text-[var(--color-ink-sub)]">
                  チェックしないと、本文は相手に開かれず、AIの提案の材料にもなりません。
                </span>
              </span>
            </label>
          </Card>

          {error && (
            <p className="mt-4 text-center text-[13px] text-[var(--color-coral-text)]">{error}</p>
          )}

          <div className="mt-4">
            <PrimaryButton onClick={submit} disabled={busy}>
              {busy ? "送信しています…" : "送信する"}
            </PrimaryButton>
          </div>
          <button
            type="button"
            onClick={() => {
              setComment("");
              setShareComment(false);
              void submit();
            }}
            disabled={busy}
            className="mt-2.5 w-full rounded-full py-3.5 text-[14px] text-[var(--color-ink-sub)]"
          >
            コメントなしで送る
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex min-h-screen flex-col px-5 pt-4 pb-10">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={back}
            className="rounded-full border-none bg-[var(--color-panel)] px-4 py-[9px] text-[13px] text-[var(--color-ink-muted)]"
          >
            戻る
          </button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-track)]">
            <div
              className="h-full rounded-full bg-[var(--color-coral)] transition-[width] duration-300"
              style={{ width: `${Math.round((idx / items.length) * 100)}%` }}
            />
          </div>
          <div className="tnum text-[13px] text-[var(--color-ink-sub)]">
            {idx + 1} / {items.length}
          </div>
        </div>

        <Card className="mt-5 px-[26px] py-[30px]" radius={28}>
          <div className="text-[13px] text-[var(--color-ink-sub)]">
            この2週間のパートナーについて
          </div>
          {/* 設問の長短で画面が跳ねないよう最低高を確保する */}
          <p className="mt-3.5 min-h-[140px] text-[21px] leading-[1.85] font-medium text-pretty">
            {item.text}
          </p>
        </Card>

        <div className="mt-auto pt-7">
          <div className="min-h-[26px] text-center text-[16px] font-bold text-[var(--color-coral-deep)]">
            {selected === undefined ? "" : SCALE_LABELS[selected]}
          </div>
          <div className="mt-3.5 flex items-end gap-[7px]">
            {SCALE_LABELS.map((label, value) => {
              const on = selected === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value}：${label}`}
                  aria-pressed={on}
                  onClick={() => pick(value)}
                  className="tnum aspect-square flex-1 rounded-full border-none text-[17px] font-bold transition-transform duration-[140ms] hover:-translate-y-1 active:scale-[0.92]"
                  style={{
                    background: on ? "#B84D33" : SCALE_TINTS[value],
                    color: on ? "#FFFFFF" : "#3A332E",
                    boxShadow: on ? "0 6px 16px rgba(184,77,51,0.35)" : "none",
                  }}
                >
                  {value}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between px-1.5 pt-3 text-[12px] text-[var(--color-ink-sub)]">
            <span>全くそうでない</span>
            <span>完全にそうだ</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

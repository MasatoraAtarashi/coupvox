import { useState } from "react";
import { AppShell, Card, Header, PrimaryButton } from "../components/shell";

interface PersonalLink {
  memberId: string;
  name: string;
  url: string;
}

const inputClass =
  "w-full rounded-[20px] border-none bg-[var(--color-panel)] px-[18px] py-3.5 text-[15px] text-[var(--color-ink)] outline-none";

export default function Setup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<PersonalLink[] | null>(null);
  const [youMemberId, setYouMemberId] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      coupleName: String(form.get("coupleName") ?? "").trim() || "ふたり",
      cadenceDays: Number(form.get("cadenceDays") ?? 14),
      you: { name: String(form.get("youName") ?? "").trim() },
      partner: { name: String(form.get("partnerName") ?? "").trim() },
    };

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("入力をご確認ください。");
      const body = (await res.json()) as { links: PersonalLink[]; youMemberId: string };
      setLinks(body.links);
      setYouMemberId(body.youMemberId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登録できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (links) {
    const partnerLink = links.find((link) => link.memberId !== youMemberId);
    const myLink = links.find((link) => link.memberId === youMemberId);
    return (
      <AppShell>
        <Header />
        <div className="a-in px-5 pt-5 pb-10">
          <Card className="px-6 py-[26px]">
            <div className="text-[24px] leading-[1.6] font-bold">はじまりました。</div>
            <p className="mt-3 text-[14px] leading-[1.9] text-[var(--color-ink-sub)]">
              1回目のアンケートがひらいています。この端末はもうあなたのものです。
            </p>
          </Card>

          {partnerLink && (
            <Card className="mt-3.5 px-6 py-[26px]" radius={28}>
              <div className="text-[16px] font-bold">
                {partnerLink.name} さんに、このリンクを渡してください
              </div>
              <p className="mt-2 text-[13px] leading-[1.9] text-[var(--color-ink-sub)]">
                LINEやメッセージで送ってください。ひらいた端末がそのまま {partnerLink.name}{" "}
                さんのものになります。ほかの人には渡さないでください。
              </p>
              <LinkBox url={partnerLink.url} />
            </Card>
          )}

          {myLink && (
            <details className="mt-3.5 rounded-[22px] bg-[var(--color-panel)] px-[18px] py-4">
              <summary className="cursor-pointer text-[13px] font-medium">
                自分のリンク（別の端末でひらくとき）
              </summary>
              <p className="mt-2 text-[12px] leading-[1.8] text-[var(--color-ink-sub)]">
                ブックマークしておくと、次回からここから回答できます。
              </p>
              <LinkBox url={myLink.url} />
            </details>
          )}

          <div className="mt-6">
            <PrimaryButton href="/">はじめる</PrimaryButton>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Header />
      <div className="a-in px-5 pt-5 pb-10">
        <Card className="px-6 py-[26px]">
          <h1 className="text-[24px] leading-[1.6] font-bold">ふたりのことを、少しだけ。</h1>
          <p className="mt-3 text-[14px] leading-[1.9] text-[var(--color-ink-sub)]">
            名前だけで始められます。記録はふたりだけが見られます。
          </p>

          <form onSubmit={submit} className="mt-6 grid gap-4">
            <Field label="ふたりの呼び名">
              <input name="coupleName" defaultValue="ふたり" className={inputClass} />
            </Field>
            <Field label="あなたの名前">
              <input name="youName" required placeholder="例：たろう" className={inputClass} />
            </Field>
            <Field label="パートナーの名前">
              <input name="partnerName" required placeholder="例：はなこ" className={inputClass} />
            </Field>
            <Field label="アンケートの間隔">
              <select name="cadenceDays" defaultValue="14" className={inputClass}>
                <option value="7">1週間ごと</option>
                <option value="14">2週間ごと</option>
                <option value="28">4週間ごと</option>
                <option value="1">毎日（動作確認用）</option>
              </select>
            </Field>

            {error && <p className="text-[13px] text-[var(--color-coral-text)]">{error}</p>}

            <div className="mt-1">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? "登録しています…" : "はじめる"}
              </PrimaryButton>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}

export function LinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex gap-2">
      <input
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="min-w-0 flex-1 rounded-[14px] bg-[var(--color-panel)] px-3 py-2.5 font-mono text-[11px]"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-full bg-[var(--color-coral-deep)] px-4 py-2.5 text-[12px] font-bold text-white"
      >
        {copied ? "コピーした" : "コピー"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] text-[var(--color-ink-sub)]">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

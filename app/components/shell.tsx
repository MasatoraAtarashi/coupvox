import { Link } from "react-router";
import { isExternalHref } from "../lib/href";

/** アプリ幅 460px の外側はページ地色。全画面共通の外枠 */
export function AppShell({
  children,
  withTabs = false,
}: {
  children: React.ReactNode;
  withTabs?: boolean;
}) {
  return (
    <div className="flex min-h-screen justify-center bg-[var(--color-page)]">
      <div
        className={`relative min-h-screen w-full max-w-[460px] bg-[var(--color-app)] ${
          withTabs ? "pb-[104px]" : "pb-10"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** コーラル円とペリウィンクル円を重ねたロゴ（重なりが「あいだ」） */
export function VennMark({ width = 26, height = 18 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 26 18" className="block">
      <circle cx="9" cy="9" r="8" fill="#F2846B" fillOpacity="0.85" />
      <circle
        cx="17"
        cy="9"
        r="8"
        fill="#8C93DB"
        fillOpacity="0.75"
        style={{ mixBlendMode: "multiply" }}
      />
    </svg>
  );
}

export function Header({ weekRange }: { weekRange?: string }) {
  return (
    <header className="flex items-center justify-between px-6 pt-5 pb-1">
      <div className="flex items-center gap-2">
        <VennMark />
        <span className="text-[17px] font-bold tracking-[3px]">あいだ</span>
      </div>
      {weekRange && <div className="text-[12px] text-[var(--color-ink-sub)]">{weekRange}</div>}
    </header>
  );
}

export function Tabs({ active }: { active: "home" | "result" }) {
  const pill = (on: boolean) =>
    on ? "bg-[var(--color-ink)] text-white" : "bg-[var(--color-track)] text-[#6B6057]";
  return (
    <nav className="fixed bottom-0 left-1/2 grid w-full max-w-[460px] -translate-x-1/2 grid-cols-2 gap-2 bg-[rgba(253,248,242,0.95)] px-5 pt-2.5 pb-6 backdrop-blur-[10px]">
      <Link
        to="/"
        className={`rounded-full py-3.5 text-center text-[14px] font-bold ${pill(active === "home")}`}
      >
        今週
      </Link>
      <Link
        to="/result"
        className={`rounded-full py-3.5 text-center text-[14px] font-bold ${pill(active === "result")}`}
      >
        みる
      </Link>
    </nav>
  );
}

export const CARD_SHADOW = "0 2px 14px rgba(120,95,70,0.07)";
export const PRIMARY_SHADOW = "0 4px 12px rgba(184,77,51,0.3)";

export function PrimaryButton({
  children,
  onClick,
  href,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const className =
    "block w-full rounded-full bg-[var(--color-coral-deep)] py-[18px] text-center text-[16px] font-bold text-white transition-colors hover:bg-[var(--color-coral-hover)] disabled:opacity-60";
  if (href) {
    if (isExternalHref(href)) {
      return (
        <a href={href} className={className} style={{ boxShadow: PRIMARY_SHADOW }}>
          {children}
        </a>
      );
    }
    return (
      <Link to={href} className={className} style={{ boxShadow: PRIMARY_SHADOW }}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{ boxShadow: PRIMARY_SHADOW }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "block w-full rounded-full bg-[var(--color-panel)] py-[15px] text-center text-[15px] font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[#EFE6DC]";
  if (href) {
    if (isExternalHref(href)) {
      return (
        <a href={href} className={className}>
          {children}
        </a>
      );
    }
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  radius = 26,
}: {
  children: React.ReactNode;
  className?: string;
  radius?: number;
}) {
  return (
    <section
      className={`bg-[var(--color-card)] ${className}`}
      style={{ borderRadius: radius, boxShadow: CARD_SHADOW }}
    >
      {children}
    </section>
  );
}

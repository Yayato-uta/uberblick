import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  List,
  MoreHorizontal,
  PiggyBank,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Sheet } from "./Sheet";
import { cx } from "./ui";

export type TabId = "overview" | "month" | "items" | "people" | "assets" | "goals" | "ending";

export interface TabMeta {
  id: TabId;
  label: string;
  short: string;
  icon: LucideIcon;
  /** shown behind the More button on a phone */
  secondary?: boolean;
}

export const TABS: TabMeta[] = [
  { id: "overview", label: "Overview", short: "Overview", icon: LayoutGrid },
  { id: "month", label: "Month by month", short: "Months", icon: CalendarDays },
  { id: "items", label: "All items", short: "Items", icon: List },
  { id: "assets", label: "What I own", short: "What I own", icon: Wallet, secondary: true },
  { id: "people", label: "Paid back to me", short: "Paid back", icon: Users, secondary: true },
  { id: "goals", label: "Saving for", short: "Saving for", icon: PiggyBank, secondary: true },
  { id: "ending", label: "Ends soon", short: "Ends soon", icon: CalendarClock, secondary: true },
];

export type TabCounts = Partial<Record<TabId, number>>;

/** Seven tabs across the top — desktop only. */
export function DesktopTabs({
  tab,
  onPick,
  counts,
}: {
  tab: TabId;
  onPick: (t: TabId) => void;
  counts: TabCounts;
}) {
  return (
    <nav className="mt-6 hidden gap-1 overflow-x-auto border-b border-rule sm:flex">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          aria-current={tab === t.id ? "page" : undefined}
          className={cx(
            "whitespace-nowrap border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest",
            tab === t.id ? "border-ink text-ink" : "border-transparent text-soft",
          )}
        >
          {t.label}
          {counts[t.id] != null && <span className="text-soft"> · {counts[t.id]}</span>}
        </button>
      ))}
    </nav>
  );
}

const PRIMARY: TabId[] = ["overview", "month", "items"];

/** Fixed bar at the bottom of a phone: three views and a More sheet. */
export function BottomNav({
  tab,
  onPick,
  counts,
}: {
  tab: TabId;
  onPick: (t: TabId) => void;
  counts: TabCounts;
}) {
  const [more, setMore] = useState(false);
  const secondaries = TABS.filter((t) => t.secondary);
  const onSecondary = secondaries.some((t) => t.id === tab);

  const cell = (active: boolean) =>
    cx(
      "flex min-h-touch flex-1 flex-col items-center justify-center gap-1 py-2 font-mono text-2xs uppercase tracking-widest",
      active ? "text-ink" : "text-soft",
    );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-card pb-safe sm:hidden"
        aria-label="Sections"
      >
        <div className="flex">
          {PRIMARY.map((id) => {
            const t = TABS.find((x) => x.id === id)!;
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onPick(t.id)}
                aria-current={active ? "page" : undefined}
                className={cell(active)}
              >
                <Icon size={19} aria-hidden />
                <span className={cx(active && "border-b border-ink")}>{t.short}</span>
              </button>
            );
          })}
          <button
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
            className={cell(onSecondary)}
          >
            <MoreHorizontal size={19} aria-hidden />
            <span className={cx(onSecondary && "border-b border-ink")}>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={more} title="Everything else" onClose={() => setMore(false)} width="max-w-md">
        <div className="grid grid-cols-1 gap-px bg-rule">
          {secondaries.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  onPick(t.id);
                  setMore(false);
                }}
                className={cx(
                  "flex min-h-[3.5rem] items-center gap-3 px-4 text-left",
                  active ? "bg-ink text-card" : "bg-card text-ink",
                )}
              >
                <Icon size={18} aria-hidden />
                <span className="flex-1 font-mono text-sm uppercase tracking-widest">
                  {t.label}
                </span>
                {counts[t.id] != null && (
                  <span className="font-mono text-sm tabular-nums opacity-70">
                    {counts[t.id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

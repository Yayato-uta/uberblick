import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Monitor,
  Moon,
  RotateCcw,
  Share,
  Smartphone,
  Sun,
  Upload,
} from "lucide-react";
import type { Asset, Goal, Item } from "./types";
import type { GoalRow } from "./lib/derive";
import { derive } from "./lib/derive";
import { emptyData } from "./lib/constants";
import { eur, uid } from "./lib/format";
import { nowIdx, toYM } from "./lib/month";
import { exportBackup, importBackup, lastExportAt } from "./lib/backup";
import { wipeStorage } from "./lib/storage";
import { useData } from "./hooks/useData";
import { useInstall } from "./hooks/useInstall";
import { useTheme } from "./hooks/useTheme";
import { BottomNav, DesktopTabs, type TabId } from "./components/Nav";
import { ItemSheet, blankDraft, draftFromItem, type ItemDraft } from "./components/ItemSheet";
import { Sheet } from "./components/Sheet";
import { Btn, Callout, cx } from "./components/ui";
import { Overview } from "./views/Overview";
import { MonthByMonth } from "./views/MonthByMonth";
import { Items } from "./views/Items";
import { People } from "./views/People";
import { Assets } from "./views/Assets";
import { Goals } from "./views/Goals";
import { Ending } from "./views/Ending";

/** Edits in a session before the app suggests taking a backup. */
const NUDGE_AFTER = 8;

export default function App() {
  const { data, ready, notice, setNotice, update, replace, edits, resetEdits, flush } = useData();
  const install = useInstall();
  const { mode, setMode } = useTheme();

  const [tab, setTab] = useState<TabId>("overview");
  const [monthK, setMonthK] = useState(0);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    body: string;
    action: string;
    run: () => void;
  }>(null);
  const [exported, setExported] = useState<Date | null>(() => lastExportAt());
  const [nudgeHidden, setNudgeHidden] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const start = useMemo(() => nowIdx(), []);
  const d = useMemo(() => derive(data, start), [data, start]);

  // the horizon can shrink under the selected month
  useEffect(() => {
    if (monthK > d.months.length - 1) setMonthK(d.months.length - 1);
  }, [d.months.length, monthK]);

  /* ── item actions ── */

  const upsertItem = (item: Item) => {
    update((p) => ({
      ...p,
      sample: false,
      items: p.items.some((i) => i.id === item.id)
        ? p.items.map((i) => (i.id === item.id ? item : i))
        : [...p.items, item],
    }));
    setDraft(null);
  };

  const removeItem = (it: Item) =>
    setConfirm({
      title: "Remove this line",
      body: `"${it.name}" comes out of the plan. Every figure recalculates without it.`,
      action: "Remove it",
      run: () =>
        update((p) => ({
          ...p,
          sample: false,
          items: p.items.filter((i) => i.id !== it.id),
          // links to a deleted item quietly un-set rather than dangling
          goals: p.goals.map((g) => (g.itemId === it.id ? stripKey(g, "itemId") : g)),
          assets: p.assets.map((a) => (a.feed === it.id ? stripKey(a, "feed") : a)),
        })),
    });

  /* ── goals ── */

  const addGoal = (g: Omit<Goal, "id">) =>
    update((p) => ({ ...p, goals: [...p.goals, { ...g, id: uid() }] }));

  const dropGoal = (id: string) =>
    update((p) => ({ ...p, goals: p.goals.filter((g) => g.id !== id) }));

  const fundGoal = (g: GoalRow) => {
    const item: Item = {
      id: uid(),
      name: g.name,
      kind: "saving",
      cat: "Savings",
      amount: Math.ceil(g.perMonth),
      freq: "monthly",
      first: toYM(g.fromIdx),
      last: g.byIdx === null ? "" : toYM(g.byIdx),
    };
    update((p) => ({
      ...p,
      sample: false,
      items: [...p.items, item],
      goals: p.goals.map((x) => (x.id === g.id ? { ...x, itemId: item.id } : x)),
    }));
  };

  /** Mark a goal's pot as being spent on the thing — or unmark it. */
  const setGoalSpend = (id: string, spend: string) =>
    update((p) => ({
      ...p,
      sample: false,
      goals: p.goals.map((g) =>
        g.id !== id ? g : spend ? { ...g, spend } : stripKey(g, "spend"),
      ),
    }));

  /* ── assets ── */

  const addAsset = (a: Omit<Asset, "id">) =>
    update((p) => ({ ...p, sample: false, assets: [...p.assets, { ...a, id: uid() }] }));

  const patchAsset = (id: string, patch: Partial<Asset>) =>
    update((p) => ({
      ...p,
      assets: p.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const dropAsset = (id: string) =>
    update((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== id),
      // anything that was paid out of it goes back to coming out of the account
      items: p.items.map((i) => (i.fund === id ? stripKey(i, "fund") : i)),
    }));

  /* ── data safety ── */

  const doExport = async () => {
    const result = await exportBackup(data);
    if (result === "cancelled") return;
    setExported(new Date());
    resetEdits();
    setNudgeHidden(false);
    setNotice(
      result === "shared"
        ? "Backup sent to wherever you chose."
        : `Backup saved as uberblick-${toYM(nowIdx())}.json.`,
    );
  };

  const doImport = async (file: File) => {
    const result = await importBackup(file);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    const incoming = result.data;
    setConfirm({
      title: "Restore this backup",
      body: `The file holds ${incoming.items.length} lines, ${incoming.goals.length} goals and ${incoming.assets.length} things you own. It replaces what's on this device.`,
      action: "Restore it",
      run: () => {
        replace(incoming);
        setMonthK(0);
        setNotice("Backup restored.");
      },
    });
  };

  const clearAll = () =>
    setConfirm({
      title: "Start from an empty plan",
      body: "Every line, goal and asset on this device goes. If you haven't taken a backup, do that first — this can't be undone.",
      action: "Empty it",
      run: () => {
        void wipeStorage();
        replace(emptyData());
        setMonthK(0);
        setTab("overview");
      },
    });

  const counts = {
    items: data.items.length,
    people: d.people.length,
    assets: data.assets.length,
    goals: data.goals.length,
    ending: d.ending.length,
  };

  const nudge = ready && !nudgeHidden && edits >= NUDGE_AFTER;

  return (
    <div className="min-h-screen w-full bg-paper text-ink">
      {/* bottom padding clears the fixed phone nav and the home indicator */}
      <div className="mx-auto max-w-6xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-10 sm:pt-8">
        {/* masthead */}
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-5">
          <div>
            <h1 className="font-mono text-3xl tracking-tight sm:text-4xl">Überblick</h1>
            <p className="mt-1 text-sm text-soft">
              Every euro that moves, month by month — including the ones that aren't really yours.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {install.canPrompt && (
              <Btn onClick={install.install}>
                <Smartphone size={13} /> Install
              </Btn>
            )}
            <Btn onClick={() => void doExport()}>
              <Download size={13} /> Back up
            </Btn>
            <Btn onClick={() => fileRef.current?.click()}>
              <Upload size={13} /> Restore
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void doImport(file);
              }}
            />
            <Btn tone="danger" onClick={clearAll}>
              <RotateCcw size={13} /> Start empty
            </Btn>
          </div>
        </header>

        {/* notices */}
        <div className="mt-4 space-y-3 empty:mt-0">
          {notice && (
            <Callout tone="ochre" dashed icon={AlertTriangle} onClose={() => setNotice("")}>
              {notice}
            </Callout>
          )}

          {data.sample && (
            <Callout tone="ochre" dashed icon={AlertTriangle}>
              These are example numbers so you can see how it works. Edit each line in All items, or
              clear the lot with Start empty.
            </Callout>
          )}

          {install.showIosHint && (
            <Callout tone="soft" dashed icon={Share} onClose={install.dismissIosHint}>
              To keep Überblick on your home screen: tap the share button in Safari, then{" "}
              <strong>Add to Home Screen</strong>. iPhones don't offer an install button — the share
              sheet is the only way.
            </Callout>
          )}

          {nudge && (
            <Callout tone="ink" dashed icon={Download} onClose={() => setNudgeHidden(true)}>
              You've changed a fair bit this session.{" "}
              <button onClick={() => void doExport()} className="underline underline-offset-2">
                Take a backup
              </button>{" "}
              — this device holds the only copy.
            </Callout>
          )}
        </div>

        <DesktopTabs tab={tab} onPick={setTab} counts={counts} />

        {tab === "overview" && <Overview data={data} d={d} update={update} />}
        {tab === "month" && <MonthByMonth d={d} k={monthK} setK={setMonthK} />}
        {tab === "items" && (
          <Items
            items={data.items}
            assets={data.assets}
            start={start}
            onAdd={() => setDraft(blankDraft())}
            onEdit={(it) => setDraft(draftFromItem(it))}
            onDelete={removeItem}
          />
        )}
        {tab === "people" && <People d={d} />}
        {tab === "assets" && (
          <Assets
            d={d}
            items={data.items}
            onAdd={addAsset}
            onPatch={patchAsset}
            onRemove={dropAsset}
          />
        )}
        {tab === "goals" && (
          <Goals
            d={d}
            onAdd={addGoal}
            onRemove={dropGoal}
            onFund={fundGoal}
            onSpend={setGoalSpend}
          />
        )}
        {tab === "ending" && <Ending d={d} />}

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-4 font-mono text-xs text-soft">
          <div>
            Saved on this device only.{" "}
            {exported
              ? `Last backup ${exported.toLocaleDateString("de-AT")}.`
              : "No backup taken yet."}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Colour scheme">
            {(
              [
                ["auto", Monitor, "Follow the device"],
                ["light", Sun, "Light"],
                ["dark", Moon, "Dark"],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                title={label}
                aria-label={label}
                className={cx(
                  "flex min-h-touch min-w-touch items-center justify-center border",
                  mode === m ? "border-ink text-ink" : "border-transparent text-soft",
                )}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
        </footer>
      </div>

      <BottomNav tab={tab} onPick={setTab} counts={counts} />

      <ItemSheet
        draft={draft}
        assets={data.assets}
        onSave={upsertItem}
        onClose={() => setDraft(null)}
      />

      <Sheet
        open={!!confirm}
        title={confirm?.title ?? ""}
        onClose={() => setConfirm(null)}
        width="max-w-md"
        footer={
          <div className="flex gap-2">
            <Btn
              tone="solid"
              className="flex-1 sm:flex-none"
              onClick={() => {
                confirm?.run();
                setConfirm(null);
              }}
            >
              {confirm?.action}
            </Btn>
            <Btn className="flex-1 sm:flex-none" onClick={() => setConfirm(null)}>
              Keep as it is
            </Btn>
          </div>
        }
      >
        <p className="text-sm">{confirm?.body}</p>
        {confirm?.action === "Empty it" && (
          <p className="mt-3 font-mono text-xs text-soft">
            Balance today {eur(data.opening)} · {data.items.length} lines · {data.goals.length} goals
          </p>
        )}
      </Sheet>

      {/* a last flush when the app is closed from a desktop tab */}
      <FlushOnUnmount flush={flush} />
    </div>
  );
}

function FlushOnUnmount({ flush }: { flush: () => Promise<void> }) {
  useEffect(() => () => void flush(), [flush]);
  return null;
}

function stripKey<T extends object, K extends keyof T>(obj: T, key: K): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

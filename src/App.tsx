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
import type { Asset, Goal, Item, Pot, Purchase } from "./types";
import type { GoalRow, PotRow } from "./lib/derive";
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
import { Pots } from "./views/Pots";
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
  /* Pots are looked at a month at a time, and the month is browsable — kept
     here so stepping through it doesn't reset when you switch tabs. */
  const [potMonth, setPotMonth] = useState(start);
  const d = useMemo(() => derive(data, start, potMonth), [data, start, potMonth]);

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
      items: p.items.map((i) => (i.from === id ? stripKey(i, "from") : i)),
    }));

  /**
   * Record what a repayment actually did in one month — nothing, or a
   * different amount — or clear the ruling and go back to the agreement.
   */
  const setReimbMonth = (itemId: string, month: string, amount: number | null) =>
    update((prev) => ({
      ...prev,
      sample: false,
      items: prev.items.map((it) => {
        if (it.id !== itemId || !it.reimb) return it;
        const rest = it.reimb.overrides.filter((o) => o.month !== month);
        return {
          ...it,
          reimb: {
            ...it.reimb,
            overrides: amount === null ? rest : [...rest, { month, amount }],
          },
        };
      }),
    }));

  /** Mark a month settled, or take the mark off. */
  const setReimbPaid = (itemId: string, month: string, on: boolean) =>
    update((prev) => ({
      ...prev,
      sample: false,
      items: prev.items.map((it) => {
        if (it.id !== itemId || !it.reimb) return it;
        const paid = it.reimb.paid.filter((m) => m !== month);
        return {
          ...it,
          reimb: {
            ...it.reimb,
            paid: on ? [...paid, month].sort() : paid,
            // settled and postponed are mutually exclusive
            deferred: on ? it.reimb.deferred.filter((m) => m !== month) : it.reimb.deferred,
          },
        };
      }),
    }));

  /** Push a month's instalment into the next month, or bring it back. */
  const setReimbDeferred = (itemId: string, month: string, on: boolean) =>
    update((prev) => ({
      ...prev,
      sample: false,
      items: prev.items.map((it) => {
        if (it.id !== itemId || !it.reimb) return it;
        const deferred = it.reimb.deferred.filter((m) => m !== month);
        return {
          ...it,
          reimb: {
            ...it.reimb,
            deferred: on ? [...deferred, month].sort() : deferred,
            paid: on ? it.reimb.paid.filter((m) => m !== month) : it.reimb.paid,
            // an override is the last word, so postponing clears it
            overrides: on
              ? it.reimb.overrides.filter((o) => o.month !== month)
              : it.reimb.overrides,
          },
        };
      }),
    }));

  /**
   * Record money sent ahead. It settles the instalments from that month on,
   * so the total owed is unchanged — only when it arrives.
   */
  const addReimbAdvance = (itemId: string, month: string, amount: number) =>
    update((prev) => ({
      ...prev,
      sample: false,
      items: prev.items.map((it) => {
        if (it.id !== itemId || !it.reimb || amount <= 0) return it;
        const rest = it.reimb.advances.filter((a) => a.month !== month);
        return { ...it, reimb: { ...it.reimb, advances: [...rest, { month, amount }] } };
      }),
    }));

  /* ── budget pots ── */

  const addPot = (p: Omit<Pot, "id">) =>
    update((prev) => ({ ...prev, sample: false, pots: [...prev.pots, { ...p, id: uid() }] }));

  const editPot = (id: string, patch: Partial<Pot>) =>
    update((prev) => ({
      ...prev,
      sample: false,
      pots: prev.pots.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const dropPot = (pot: PotRow) =>
    setConfirm({
      title: "Remove this pot",
      body: pot.purchases.length
        ? `"${pot.name}" goes, and so does everything logged against it.`
        : `"${pot.name}" comes out of the plan.`,
      action: "Remove it",
      run: () =>
        update((prev) => ({
          ...prev,
          sample: false,
          pots: prev.pots.filter((p) => p.id !== pot.id),
          // expenses drawn from it go back on the account rather than vanishing
          items: prev.items.map((i) => (i.from === pot.id ? stripKey(i, "from") : i)),
          // nothing may be left charged to a pot that no longer exists
          purchases: prev.purchases.filter((x) => x.potId !== pot.id),
        })),
    });

  const addPurchase = (x: Omit<Purchase, "id">) =>
    update((prev) => ({
      ...prev,
      sample: false,
      purchases: [...prev.purchases, { ...x, id: uid() }],
    }));

  const dropPurchase = (x: Purchase) =>
    update((prev) => ({ ...prev, purchases: prev.purchases.filter((p) => p.id !== x.id) }));

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
    pots: data.pots.length,
    items: data.items.length,
    people: d.people.length,
    assets: data.assets.length,
    goals: data.goals.length,
    ending: d.ending.length,
  };

  const nudge = ready && !nudgeHidden && edits >= NUDGE_AFTER;

  /** The same three actions in the desktop header and the phone's More sheet. */
  const dataActions = (close: () => void = () => {}) => (
    <>
      {install.canPrompt && (
        <Btn
          className="w-full sm:w-auto"
          onClick={() => {
            close();
            void install.install();
          }}
        >
          <Smartphone size={13} /> Install
        </Btn>
      )}
      <Btn
        className="w-full sm:w-auto"
        onClick={() => {
          close();
          void doExport();
        }}
      >
        <Download size={13} /> Back up
      </Btn>
      <Btn
        className="w-full sm:w-auto"
        onClick={() => {
          close();
          fileRef.current?.click();
        }}
      >
        <Upload size={13} /> Restore
      </Btn>
      <Btn
        tone="danger"
        className="w-full sm:w-auto"
        onClick={() => {
          close();
          clearAll();
        }}
      >
        <RotateCcw size={13} /> Start empty
      </Btn>
    </>
  );

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
          {/* On a phone these live behind More: they're used rarely, and one of
              them wipes everything — neither deserves the top of every screen. */}
          <div className="hidden flex-wrap gap-2 sm:flex">{dataActions()}</div>
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
        {tab === "pots" && (
          <Pots
            d={d}
            onStep={(delta) => setPotMonth((m) => m + delta)}
            onAddPot={addPot}
            onEditPot={editPot}
            onDropPot={dropPot}
            onSpend={addPurchase}
            onDropPurchase={dropPurchase}
          />
        )}
        {tab === "items" && (
          <Items
            items={data.items}
            pots={data.pots}
            assets={data.assets}
            start={start}
            onAdd={() => setDraft(blankDraft())}
            onEdit={(it) => setDraft(draftFromItem(it))}
            onDelete={removeItem}
          />
        )}
        {tab === "people" && (
          <People
            d={d}
            onSetMonth={setReimbMonth}
            onSetPaid={setReimbPaid}
            onSetDeferred={setReimbDeferred}
            onAdvance={addReimbAdvance}
          />
        )}
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

      <BottomNav
        tab={tab}
        onPick={setTab}
        counts={counts}
        dataActions={(close) => (
          <div className="flex flex-col gap-2">{dataActions(close)}</div>
        )}
      />

      <ItemSheet
        draft={draft}
        allItems={data.items}
        pots={data.pots}
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

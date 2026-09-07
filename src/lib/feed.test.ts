import { afterEach, describe, expect, it, vi } from "vitest";
import type { Snapshot, StockBook, StockFacts } from "../types";
import { emptyStockBook } from "./constants";
import { FEED_URL, dueACheck, fetchWeek, shouldTake } from "./feed";
import { blankFacts } from "./snapshot";

const facts = (ticker: string, price = 10): StockFacts => ({
  ...blankFacts(),
  ticker,
  name: ticker,
  price,
});

const snap = (week: string, tickers = ["AAA"], source = "ci"): Snapshot => ({
  week,
  takenAt: "2026-09-07T06:00:00.000Z",
  source,
  sample: false,
  facts: tickers.map((t) => facts(t)),
});

const bookOf = (over: Partial<StockBook> = {}): StockBook => ({
  ...emptyStockBook(),
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deciding whether to look", () => {
  const NOW = new Date("2026-09-07T12:00:00.000Z");

  it("does not look at all when the owner turned it off", () => {
    expect(dueACheck(bookOf({ auto: false }), NOW)).toBe(false);
    expect(dueACheck(bookOf({ auto: false, lastFetch: "" }), NOW)).toBe(false);
  });

  it("looks the first time", () => {
    expect(dueACheck(bookOf(), NOW)).toBe(true);
  });

  /* The file changes once a week. Asking on every load is asking a question
     whose answer cannot have changed. */
  it("does not look again straight away", () => {
    const justNow = new Date(NOW.getTime() - 60_000).toISOString();
    expect(dueACheck(bookOf({ lastFetch: justNow }), NOW)).toBe(false);
  });

  it("looks again the next day", () => {
    const yesterday = new Date(NOW.getTime() - 25 * 3600_000).toISOString();
    expect(dueACheck(bookOf({ lastFetch: yesterday }), NOW)).toBe(true);
  });

  it("treats a stamp it cannot read as never having looked", () => {
    expect(dueACheck(bookOf({ lastFetch: "some time last year" }), NOW)).toBe(true);
  });
});

describe("deciding whether to take what came back", () => {
  it("takes a week the book has never seen", () => {
    expect(shouldTake(bookOf({ snapshots: [snap("2026-W35")] }), snap("2026-W36"))).toBe(true);
  });

  /* This is the rule that protects a week you typed companies into yourself.
     The scheduled job publishes the watchlist's version of the same seven
     days; taking it would silently replace your work. Import a week still
     overwrites, because that one you asked for. */
  it("leaves a week it already has completely alone", () => {
    const mine = snap("2026-W36", ["OMV.VI", "VOE.VI"], "edited by hand");
    const book = bookOf({ snapshots: [mine] });
    expect(shouldTake(book, snap("2026-W36", ["AAPL", "MSFT"]))).toBe(false);
  });

  it("ignores an empty week rather than filing a blank one", () => {
    expect(shouldTake(bookOf(), snap("2026-W36", []))).toBe(false);
  });

  it("takes a real week over the shipped illustration", () => {
    const illustration: Snapshot = { ...snap("2026-W36", ["EXA"]), sample: true };
    expect(shouldTake(bookOf({ snapshots: [illustration] }), snap("2026-W37"))).toBe(true);
  });

  /* The illustration is stamped with whatever week the app was first opened
     in — usually this one. Counting it as a record of that week would refuse
     the first real fetch, and go on refusing it for seven days, which looks
     exactly like the whole feature being broken. */
  it("takes a real week even where the illustration already claims it", () => {
    const illustration: Snapshot = { ...snap("2026-W36", ["EXA", "EXB"]), sample: true };
    const incoming = snap("2026-W36", ["OMV.VI"]);
    expect(shouldTake(bookOf({ snapshots: [illustration] }), incoming)).toBe(true);
  });

  it("still refuses to overwrite a real week of the same name", () => {
    const mine = snap("2026-W36", ["OMV.VI"], "edited by hand");
    const illustration: Snapshot = { ...snap("2026-W35", ["EXA"]), sample: true };
    const book = bookOf({ snapshots: [mine, illustration] });
    expect(shouldTake(book, snap("2026-W36", ["AAPL"]))).toBe(false);
  });
});

describe("fetching the published week", () => {
  const body = {
    week: "2026-W36",
    takenAt: "2026-09-07T06:00:00.000Z",
    source: "ci",
    facts: [{ ticker: "OMV.VI", price: 41.5, eps: 7.2 }],
  };

  it("reads a week off its own origin", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(body), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const got = await fetchWeek();
    expect(got!.week).toBe("2026-W36");
    expect(got!.facts[0].ticker).toBe("OMV.VI");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FEED_URL);
    // a week-old copy in the HTTP cache is the thing this call exists to replace
    expect((init as RequestInit).cache).toBe("no-store");
  });

  /* Offline, a dead provider and a workflow nobody gave a key to all look the
     same from in here, and none of them may take the screen down. */
  it("comes back empty-handed rather than throwing, whatever went wrong", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchWeek()).resolves.toBeNull();

    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    await expect(fetchWeek()).resolves.toBeNull();

    vi.stubGlobal("fetch", async () => new Response("{ half a fi", { status: 200 }));
    await expect(fetchWeek()).resolves.toBeNull();
  });

  it("refuses a file that parses but plainly isn't a week of companies", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await expect(fetchWeek()).resolves.toBeNull();
  });

  it("shrugs where there is no fetch to be had at all", async () => {
    vi.stubGlobal("fetch", undefined);
    await expect(fetchWeek()).resolves.toBeNull();
  });
});

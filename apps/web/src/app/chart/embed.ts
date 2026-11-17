import embed, { type Result } from "vega-embed";
import { type ChartLocale, DATA_NAME, type Datum } from "./spec.ts";

// The drawing of a chart in the page (step 41), loaded with a dynamic import by ChartCanvas, so that
// a text answer never downloads Vega. One drawing per canvas: a new version with the same layers
// moves its marks from the old values to the new ones (the data set is tweened frame by frame and
// the scales follow); a version whose layers changed (the kind of chart, an axis, the calculation)
// is drawn again, faded in. Reduced motion: every change is immediate.

const TWEEN_MS = 750;

export interface DrawnRow {
  [field: string]: string | number | null;
}

export interface Drawing {
  /** Shows a version: its spec (with the named data set) and its rows. */
  update(spec: Record<string, unknown>, rows: readonly Datum[]): Promise<void>;
  /** The rows the first layer draws, after the calculation (for the table of an upload). */
  drawn(): DrawnRow[];
  destroy(): void;
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The rows of `from` matched to `to`: by `key` when every row has one, else by position. */
function pairs(from: readonly Datum[], to: readonly Datum[]): [Datum | undefined, Datum][] {
  const keyed = to.every((r) => r.key !== undefined) && from.every((r) => r.key !== undefined);
  if (!keyed) return to.map((r, i) => [from[i], r]);
  const byKey = new Map(from.map((r) => [String(r.key), r]));
  return to.map((r) => [byKey.get(String(r.key)), r]);
}

/**
 * Where a number that appears or leaves starts or ends: a value that comes out of a range starts in
 * its middle; the ends of a range that closes start (or end) at the value.
 */
function anchor(row: Datum, field: string): number | null {
  const n = (f: string) => (typeof row[f] === "number" ? (row[f] as number) : null);
  if (field === "value" || field === "at") {
    const low = n("low");
    const high = n("high");
    return low !== null && high !== null ? (low + high) / 2 : (high ?? low);
  }
  if (field === "low" || field === "high") return n("value");
  return null;
}

/** The frame at `p` (0 to 1) between two data sets. */
function frame(from: readonly Datum[], to: readonly Datum[], p: number): Datum[] {
  return pairs(from, to).map(([a, b]) => {
    if (!a) return b;
    const out: Datum = { ...b };
    for (const [field, target] of Object.entries(b)) {
      if (typeof a[field] !== "number" && typeof target !== "number") continue;
      const start = typeof a[field] === "number" ? (a[field] as number) : anchor(a, field);
      const end = typeof target === "number" ? target : anchor(b, field);
      if (start === null || end === null || (typeof target !== "number" && p === 1)) continue;
      // a number that leaves goes to its anchor, and is gone at the end
      out[field] = start + (end - start) * p;
    }
    return out;
  });
}

/** The name of the data set the first mark draws, in a compiled Vega spec. */
function firstMarkData(spec: unknown): string | null {
  const marks = (spec as { marks?: unknown[] } | null)?.marks ?? [];
  for (const m of marks) {
    const from = (m as { from?: { data?: unknown; facet?: { data?: unknown } } }).from;
    if (typeof from?.data === "string") return from.data;
    if (typeof from?.facet?.data === "string") return from.facet.data;
    const inner = firstMarkData(m);
    if (inner) return inner;
  }
  return null;
}

/** The structure of a spec: what must stay the same for the marks to move instead of a new drawing. */
const structureOf = (spec: Record<string, unknown>) =>
  JSON.stringify({ ...spec, width: 0, height: 0 });

export async function draw(
  container: HTMLElement,
  spec: Record<string, unknown>,
  rows: readonly Datum[],
  locale: ChartLocale,
): Promise<Drawing> {
  let result: Result | null = null;
  let structure = "";
  let shown: Datum[] = [];
  let frameId = 0;
  let destroyed = false;
  /** Every change takes a number: an animation that a newer change overtook stops. */
  let generation = 0;

  async function mount(next: Record<string, unknown>, data: readonly Datum[], mine: number) {
    const host = document.createElement("div");
    host.className = "chart-drawing";
    // The frame is the image, with its label; the table under it is its text. Vega gives its
    // marks roles of their own, which a screen reader would read without a name.
    host.setAttribute("aria-hidden", "true");
    const fade = result !== null && !reducedMotion();
    if (fade) host.classList.add("chart-drawing-enter");
    const created = await embed(host, next as never, {
      actions: false,
      renderer: "svg",
      tooltip: false,
      // Errors only: the first pass runs before the rows are in, and warns of empty scales.
      logLevel: 1,
      formatLocale: locale.number as never,
      timeFormatLocale: locale.time as never,
    });
    if (destroyed || mine !== generation) {
      created.finalize();
      return;
    }
    created.view.data(
      DATA_NAME,
      data.map((r) => ({ ...r })),
    );
    await created.view.runAsync();
    result?.finalize();
    container.replaceChildren(host);
    if (fade) requestAnimationFrame(() => host.classList.remove("chart-drawing-enter"));
    result = created;
    structure = structureOf(next);
    shown = data.map((r) => ({ ...r }));
  }

  async function show(data: readonly Datum[]) {
    if (!result) return;
    result.view.data(
      DATA_NAME,
      data.map((r) => ({ ...r })),
    );
    await result.view.runAsync();
  }

  function tween(target: readonly Datum[], mine: number): Promise<void> {
    cancelAnimationFrame(frameId);
    const from = shown;
    const started = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        if (destroyed || mine !== generation) return resolve();
        const p = Math.min(1, (now - started) / TWEEN_MS);
        const current = frame(from, target, ease(p));
        shown = current;
        void show(current).then(() => {
          if (p < 1) frameId = requestAnimationFrame(step);
          else resolve();
        });
      };
      frameId = requestAnimationFrame(step);
    });
  }

  await mount(spec, rows, generation);
  return {
    async update(next, data) {
      if (destroyed) return;
      const mine = ++generation;
      cancelAnimationFrame(frameId);
      if (structureOf(next) !== structure || !result) return mount(next, data, mine);
      // a new size is set on the drawing: nothing moves, nothing is drawn again
      if (typeof next.width === "number" && result.view.width() !== next.width)
        result.view.width(next.width);
      if (typeof next.height === "number" && result.view.height() !== next.height)
        result.view.height(next.height);
      if (!reducedMotion()) await tween(data, mine);
      if (mine !== generation || destroyed) return;
      shown = data.map((r) => ({ ...r }));
      await show(shown);
    },
    drawn() {
      if (!result) return [];
      const name = firstMarkData(result.vgSpec);
      if (!name) return [];
      try {
        return (result.view.data(name) as DrawnRow[]).map((d) => ({ ...d }));
      } catch {
        return [];
      }
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameId);
      result?.finalize();
      result = null;
    },
  };
}

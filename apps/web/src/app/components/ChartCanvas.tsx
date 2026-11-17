import { useEffect, useRef, useState } from "react";
import type { Drawing, DrawnRow } from "../chart/embed.ts";
import type { Datum } from "../chart/spec.ts";
import { t } from "../i18n/index.ts";

/** The height of the drawing for the width of its container: lower on a phone. */
function heightFor(width: number): number {
  return Math.round(Math.min(340, Math.max(220, width * 0.55)));
}

/** The drawing of one mounted canvas: created on the first version, then told every next one. */
interface Painter {
  alive: boolean;
  drawing: Drawing | null;
  loading: boolean;
  /** The version waiting while the drawing loads: only the latest is drawn. */
  next: { spec: Record<string, unknown>; data: readonly Datum[] } | null;
}

/**
 * The drawing of a version of a chart (step 41). Vega is loaded on the first chart of the page (a
 * chunk of its own: text answers never download it). A new version moves the marks to their new
 * values (see chart/embed.ts); `onDrawn` receives the rows the drawing computed, for the table of
 * an upload. The figure has a label and nothing inside it is read: the table under it is its text.
 */
export function ChartCanvas({
  spec,
  data,
  label,
  onDrawn,
}: {
  spec: (height: number) => Record<string, unknown>;
  data: readonly Datum[];
  label: string;
  onDrawn?: (rows: DrawnRow[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const painter = useRef<Painter | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [size, setSize] = useState({ width: 0, height: 260 });
  const onDrawnRef = useRef(onDrawn);
  onDrawnRef.current = onDrawn;

  // The drawing takes the width of its box, and a height for it (a phone gets a lower chart).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      setSize((s) => (s.width === width ? s : { width, height: heightFor(width) }));
    };
    measure();
    // On the next frame: a new size in the same frame would loop the observer.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const p: Painter = { alive: true, drawing: null, loading: false, next: null };
    painter.current = p;
    return () => {
      p.alive = false;
      p.drawing?.destroy();
      p.drawing = null;
      if (painter.current === p) painter.current = null;
    };
  }, []);

  const specified = { ...spec(size.height), width: size.width };
  const key = JSON.stringify(specified);
  const rows = JSON.stringify(data);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the spec and the rows are compared by their JSON
  useEffect(() => {
    const p = painter.current;
    const el = box.current;
    // nothing is drawn before the box has a width
    if (!p || !el || size.width === 0) return;
    const done = () => {
      if (!p.alive || !p.drawing) return;
      setState("ready");
      onDrawnRef.current?.(p.drawing.drawn());
    };
    const failed = (error: unknown) => {
      console.error("The chart could not be drawn.", error);
      if (p.alive) setState("failed");
    };
    if (p.drawing) {
      p.drawing.update(specified, data).then(done, failed);
      return;
    }
    p.next = { spec: specified, data };
    if (p.loading) return;
    p.loading = true;
    import("../chart/embed.ts")
      .then(async ({ draw }) => {
        const first = p.next;
        p.next = null;
        if (!p.alive || !first) return;
        const drawing = await draw(el, first.spec, first.data, t.chart.locale);
        if (!p.alive) return drawing.destroy();
        p.drawing = drawing;
        done();
        const latest = p.next as Painter["next"];
        p.next = null;
        if (latest) await drawing.update(latest.spec, latest.data).then(done);
      })
      .catch(failed);
  }, [key, rows]);

  return (
    <div className="chart-frame" data-state={state}>
      <div ref={box} className="chart-canvas" role="img" aria-label={label} data-testid="chart" />
      {state === "loading" && <p className="chart-status muted">{t.chart.drawing}</p>}
      {state === "failed" && (
        <p className="chart-status error" role="alert">
          {t.chart.failed}
        </p>
      )}
    </div>
  );
}

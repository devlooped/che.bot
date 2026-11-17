import type { OutputOf, RenderRequest } from "@chebot/protocol";
import * as vega from "vega";
import { expressionInterpreter } from "vega-interpreter";
import { compile, type TopLevelSpec } from "vega-lite";

// The render gate of chart runs: a Vega-Lite spec compiled to Vega and rendered to SVG, headless.
// Vega compiles its expressions to JavaScript with `new Function` by default, which the Workers
// runtime forbids ("Code generation from strings disallowed for this context"); here the spec is
// parsed to an AST (`ast: true`) and evaluated by `vega-interpreter`. No data is ever loaded: the
// loader refuses every URL (a chart's data is inline, composed by `chartSpec`).
//
// Step 36, measured on 2026-11-16 (vega 6.4, vega-lite 6.5, vega-interpreter 2.3, wrangler 4.163):
// - In the Workers runtime (vitest pool) a first render takes 35 ms and the next ones 7 ms; without
//   the interpreter the same spec fails with the EvalError above.
// - The three packages add 851 KiB minified (296 KiB gzip) to a Worker; evaluating that module takes
//   40-110 ms of the 1 s startup limit (V8, Node 24), and a first render 50-60 ms more.
// Decision: the check runs inside RunObject, the object that runs the steps, and the module is loaded
// with a dynamic import on the first render call, so a Worker that only answers the API never
// evaluates it (see apps/web/src/worker/deps.ts and the README of apps/web).

/** At most this many drawn items are reported back (the data of the marks, for the checks of tests). */
const MAX_MARK_ITEMS = 2000;

export interface RenderedSpec {
  svg: string;
  /** The data of every drawn mark item (axes and legends left out), as plain values. */
  marks: Record<string, unknown>[];
}

class CapturingLogger {
  readonly errors: string[] = [];
  private current = vega.Warn;
  level(): number;
  level(_: number): this;
  level(value?: number): number | this {
    if (value === undefined) return this.current;
    this.current = value;
    return this;
  }
  error(...args: unknown[]) {
    this.errors.push(args.map(String).join(" "));
    return this;
  }
  warn() {
    return this;
  }
  info() {
    return this;
  }
  debug() {
    return this;
  }
}

function offlineLoader() {
  const loader = vega.loader();
  const refuse = async () => {
    throw new Error("A chart loads no data: its rows are inline.");
  };
  loader.load = refuse;
  loader.sanitize = refuse;
  loader.http = refuse;
  loader.file = refuse;
  return loader;
}

/** Compiles and renders one Vega-Lite spec to SVG. Throws when it does not compile or render, or draws nothing. */
export async function renderSpec(spec: Record<string, unknown>): Promise<RenderedSpec> {
  const logger = new CapturingLogger();
  const { spec: compiled } = compile(spec as unknown as TopLevelSpec, { logger: logger as never });
  const runtime = vega.parse(compiled, undefined, { ast: true });
  const view = new vega.View(runtime, {
    renderer: "none",
    expr: expressionInterpreter as never,
    loader: offlineLoader(),
    logger: logger as never,
  });
  try {
    await view.runAsync();
    const svg = await view.toSVG();
    if (logger.errors.length > 0) throw new Error(logger.errors[0]);
    const marks: Record<string, unknown>[] = [];
    collect((view.scenegraph() as unknown as { root: SceneNode }).root, marks);
    if (marks.length === 0) throw new Error("The chart draws nothing.");
    return { svg, marks };
  } finally {
    view.finalize();
  }
}

interface SceneNode {
  marktype?: string;
  role?: string;
  items?: SceneItem[];
}
interface SceneItem {
  datum?: unknown;
  items?: SceneNode[];
}

function collect(node: SceneNode | undefined, out: Record<string, unknown>[]) {
  if (!node) return;
  const drawn = node.marktype !== "group" && node.role === "mark";
  for (const item of node.items ?? []) {
    if (drawn && out.length < MAX_MARK_ITEMS && item.datum && typeof item.datum === "object")
      out.push(plain(item.datum as Record<string, unknown>));
    for (const child of item.items ?? []) collect(child, out);
  }
}

function plain(datum: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datum)) {
    if (v === null || typeof v === "number" || typeof v === "string" || typeof v === "boolean")
      out[k] = v;
    else if (v instanceof Date) out[k] = v.toISOString();
  }
  return out;
}

/**
 * The renderer of the driver (`ChartRenderer` of @chebot/driver): each spec on its own, in order,
 * a failure as a failed result with its error.
 */
export async function renderSpecs(
  req: RenderRequest & { signal?: { readonly aborted: boolean } },
): Promise<OutputOf<"render">> {
  const results: OutputOf<"render">["results"] = [];
  for (const { id, spec } of req.specs) {
    if (req.signal?.aborted) {
      results.push({ id, status: "failed", error: "The render timed out.", svg: "", marks: "[]" });
      continue;
    }
    try {
      const rendered = await renderSpec(spec);
      results.push({
        id,
        status: "ok",
        error: "",
        svg: rendered.svg,
        marks: JSON.stringify(rendered.marks),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id, status: "failed", error: message.slice(0, 300), svg: "", marks: "[]" });
    }
  }
  return { results };
}

export const chartRenderer = { render: renderSpecs };

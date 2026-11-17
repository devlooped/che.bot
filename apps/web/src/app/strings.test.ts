import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseSync, Visitor } from "vite";
import { describe, expect, it } from "vitest";
import { esAR } from "./i18n/es-AR.ts";

// Every visible text comes from the messages file (i18n/es-AR.ts). This test parses every
// component and fails on text a reader would see that is written in the component itself: JSX
// text, string literals or template literals as JSX children, and the attributes that are read
// aloud or shown (aria-label, title, placeholder, alt). Texts built in plain functions and passed
// along are out of its reach; those functions read `t` too (view/derive.ts, view/errors.ts).

const ROOT = path.join(import.meta.dirname);
const LOCAL_CLIENT = path.join(ROOT, "..", "local", "client.tsx");
const VISIBLE_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
]);
const LETTER = /\p{L}/u;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "i18n" ? [] : sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

interface Node {
  type: string;
  start: number;
  value?: unknown;
  name?: { name?: unknown };
  expression?: Node;
  quasis?: { value: { raw: string } }[];
}

/** The visible texts written in a source file, with their offsets. */
function hardcodedTexts(file: string, code: string): string[] {
  const { program, errors } = parseSync(file, code);
  if (errors.length > 0) throw new Error(`${file} does not parse: ${errors[0]?.message}`);
  const found: string[] = [];
  const add = (node: Node, text: string) => {
    if (LETTER.test(text)) found.push(`${path.basename(file)}@${node.start}: ${text.trim()}`);
  };
  const literalText = (node: Node | undefined): string | null => {
    if (!node) return null;
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    if (node.type === "TemplateLiteral")
      return (node.quasis ?? []).map((q) => q.value.raw).join("");
    return null;
  };
  /** A literal written as a child of an element: `{"text"}` or a template. */
  const children = (child: Node) => {
    if (child.type !== "JSXExpressionContainer") return;
    const text = literalText(child.expression);
    if (text !== null) add(child, text);
  };
  new Visitor({
    JSXText(node) {
      add(node as unknown as Node, String((node as { value: string }).value));
    },
    JSXElement(node) {
      for (const child of (node as unknown as { children: Node[] }).children) children(child);
    },
    JSXFragment(node) {
      for (const child of (node as unknown as { children: Node[] }).children) children(child);
    },
    JSXAttribute(node) {
      const n = node as unknown as Node & { value?: Node | null };
      const name = String(n.name?.name ?? "");
      if (!VISIBLE_ATTRIBUTES.has(name)) return;
      const value = n.value;
      const text =
        value?.type === "JSXExpressionContainer"
          ? literalText(value.expression)
          : literalText(value ?? undefined);
      if (text !== null) add(n, text);
    },
  }).visit(program);
  return found;
}

describe("visible strings", () => {
  it("live only in the messages file", () => {
    const files = [...sources(ROOT), LOCAL_CLIENT];
    expect(files.length).toBeGreaterThan(10);
    const found = files.flatMap((file) => hardcodedTexts(file, readFileSync(file, "utf8")));
    expect(found).toEqual([]);
  });

  it("are caught by the check when a component writes its own", () => {
    const sample = `export const A = () => (
      <p title="Hola" aria-label={"Cerrar"}>
        Preguntá acá {"o acá"} {\`y acá\`} {t.ok} {n}
        <img alt="foto" src="/x.png" />
      </p>
    );`;
    expect(hardcodedTexts("sample.tsx", sample)).toHaveLength(6);
    expect(hardcodedTexts("ok.tsx", "export const B = () => <p title={t.x}>{t.y}.</p>;")).toEqual(
      [],
    );
  });

  it("use voseo, not the forms of neutral or peninsular Spanish", () => {
    const all: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") all.push(value);
      else if (typeof value === "function") {
        for (const args of [["X", "Y", "Z"], [2, 4, 1], [["X", "Y"]]]) {
          try {
            const out = (value as (...a: unknown[]) => unknown)(...args);
            if (typeof out === "string") all.push(out);
          } catch {
            // another kind of argument
          }
        }
      } else if (value && typeof value === "object") for (const v of Object.values(value)) walk(v);
    };
    walk(esAR);
    const text = all.join("\n");
    // Imperatives and present forms of tú or usted that voseo replaces, and peninsular words.
    const forbidden =
      /\b(escanea el|paga con|entra para|prueba de nuevo|espera un|escribe tu|revisa tu|toca una|puedes|tienes|quieres|vosotros|ordenador|vale|usted)\b/i;
    expect(text).not.toMatch(forbidden);
    expect(text).toMatch(/Escaneá|Probá|Esperá|Escribí|Tocá|Entrá|Revisá|Pagá/);
  });
});

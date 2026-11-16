import { describe, expect, test } from "vitest";
import { z } from "zod";
import { SCHEMAS, schemaFor } from "./schemas.ts";

// The simple subset every provider accepts: objects whose properties are all required and closed,
// strings (optionally a string enum), plain arrays. Anything else fails, listed by path.
const ALLOWED: Record<string, readonly string[]> = {
  object: ["type", "properties", "required", "additionalProperties", "description", "$schema"],
  array: ["type", "items", "description"],
  string: ["type", "enum", "description"],
};

function violations(node: unknown, path: string): string[] {
  if (typeof node !== "object" || node === null) return [`${path}: not a schema`];
  const schema = node as Record<string, unknown>;
  const type = schema.type;
  if (typeof type !== "string" || !(type in ALLOWED)) return [`${path}: type ${String(type)}`];
  const out = Object.keys(schema)
    .filter((k) => !ALLOWED[type]?.includes(k))
    .map((k) => `${path}: ${k}`);
  if (type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const required = (schema.required ?? []) as string[];
    if (schema.additionalProperties !== false) out.push(`${path}: open object`);
    for (const key of Object.keys(properties)) {
      if (!required.includes(key)) out.push(`${path}.${key}: optional`);
      out.push(...violations(properties[key], `${path}.${key}`));
    }
  }
  if (type === "array") out.push(...violations(schema.items, `${path}[]`));
  if (type === "string" && "enum" in schema) {
    const values = schema.enum as unknown[];
    if (!values.every((v) => typeof v === "string")) out.push(`${path}: non-string enum`);
  }
  return out;
}

describe("schemas stay inside the simple subset", () => {
  for (const [kind, schema] of Object.entries(SCHEMAS)) {
    test(kind, () => {
      expect(violations(z.toJSONSchema(schema), kind)).toEqual([]);
    });
  }

  test("the walker rejects what is outside the subset", () => {
    const bad = z.object({
      a: z.string().optional(),
      b: z.number(),
      c: z.string().nullable(),
      d: z.array(z.string()).min(1),
      e: z.string().max(10),
    });
    expect(violations(z.toJSONSchema(bad), "bad")).toEqual(
      expect.arrayContaining([
        "bad.a: optional",
        "bad.b: type number",
        "bad.c: type string,null",
        "bad.d: minItems",
        "bad.e: maxLength",
      ]),
    );
  });

  test("schemaFor looks schemas up by call kind", () => {
    expect(schemaFor("round2")).toBe(SCHEMAS.round2);
    expect(schemaFor("draft").safeParse({ answer: "x", claims: [] }).success).toBe(true);
  });
});

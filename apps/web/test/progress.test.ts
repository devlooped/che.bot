import type { Call, ProgressMessage } from "@chebot/protocol";
import { expect, test, vi } from "vitest";
import { SeatProgress } from "../src/worker/progress.ts";

const call = (seat: Call["seat"], key = `draft:0:${seat}`) => ({ seat, key }) as Call;

test("what each seat said goes out at most once per period, and goes away when its call lands", async () => {
  const sent: ProgressMessage[] = [];
  const progress = new SeatProgress((message) => sent.push(message), 10);
  progress.add(call("grok"), "Busco la ");
  progress.add(call("grok"), "capital.\n\nLa tengo");
  progress.add(call("claude"), "Pienso.");
  progress.add(call("utility", "merge:0"), "Junto.");
  expect(sent).toEqual([]);
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent).toEqual([
    {
      type: "seat.progress",
      seat: "grok",
      call: "draft:0:grok",
      text: "Busco la capital.\n\nLa tengo",
    },
    { type: "seat.progress", seat: "claude", call: "draft:0:claude", text: "Pienso." },
  ]);
  // only what is new goes out
  progress.add(call("grok"), ".");
  await vi.waitFor(() => expect(sent).toHaveLength(3));
  expect(sent[2]).toEqual({ type: "seat.progress", seat: "grok", call: "draft:0:grok", text: "." });
  progress.end(call("grok"));
  expect(sent.at(-1)).toEqual({
    type: "seat.progress",
    seat: "grok",
    call: "draft:0:grok",
    text: null,
  });
  progress.close();
  expect(sent.at(-1)).toEqual({
    type: "seat.progress",
    seat: "claude",
    call: "draft:0:claude",
    text: null,
  });
  expect(sent).toHaveLength(5);
});

test("a seat whose call never sent anything is not hidden", () => {
  const sent: ProgressMessage[] = [];
  const progress = new SeatProgress((message) => sent.push(message), 1_000);
  progress.add(call("openai", "round:1:openai"), "Primero.");
  progress.end(call("openai", "round:1:openai"));
  progress.close();
  expect(sent).toEqual([]);
});

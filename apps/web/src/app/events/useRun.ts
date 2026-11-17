import { emptyView } from "@chebot/protocol";
import { useCallback, useEffect, useState } from "react";
import { ApiError, createApi, type RunSummary, socketUrl } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { type Connection, RunStream, type StreamState } from "./client.ts";

export interface RunState {
  stream: StreamState;
  summary: RunSummary | null;
  error: ApiError | null;
  /** Reads the summary again (after paying: the status changes before any event). */
  refresh: () => void;
}

/** Events are public: read without a token, so the stream does not wait for sign-in. */
const publicApi = createApi(async () => null);

const initial: StreamState = { view: emptyView(), seq: 0, connection: "connecting", fresh: [] };

/** The live view of a run: its summary, and its event stream through RunStream. */
export function useRun(runId: string): RunState {
  const { api, ready, user } = useSession();
  const [stream, setStream] = useState<StreamState>(initial);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);

  // The summary depends on who reads (`mine`): read again when the user changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick asks for a new read
  useEffect(() => {
    if (!ready) return;
    let live = true;
    api
      .summary(runId)
      .then((s) => live && setSummary(s))
      .catch(
        (e: unknown) =>
          live && setError(e instanceof ApiError ? e : new ApiError("other", 0, String(e))),
      );
    return () => {
      live = false;
    };
  }, [api, ready, runId, user?.id, tick]);

  useEffect(() => {
    setStream(initial);
    const s = new RunStream({
      transport: {
        events: (after) => publicApi.events(runId, after),
        socket: (after, handlers) => {
          const ws = new WebSocket(socketUrl(runId, after));
          ws.onopen = () => handlers.open();
          ws.onmessage = (e) => handlers.message(e.data);
          ws.onclose = () => handlers.close();
          return {
            close: () => {
              ws.onclose = null;
              ws.close();
            },
          };
        },
      },
      onChange: setStream,
    });
    s.start().catch((e: unknown) => {
      setError(e instanceof ApiError ? e : new ApiError("network", 0, String(e)));
    });
    return () => s.stop();
  }, [runId]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { stream, summary, error, refresh };
}

export type { Connection };

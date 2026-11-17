import { MODELS, type ModelId } from "@chebot/protocol";
import { useEffect, useId, useState } from "react";
import type { RunSpend, SpendPivot, SpendRow } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { t } from "../i18n/index.ts";

/** How often an open run's spend is read again: calls land one by one, between the events. */
const POLL_MS = 4_000;

const PIVOTS: SpendPivot[] = ["agent", "model", "stage"];

const isModel = (label: string): label is ModelId => (MODELS as readonly string[]).includes(label);

function labelOf(pivot: SpendPivot, label: string): string {
  if (pivot === "stage") return t.spend.stages[label] ?? label;
  if (pivot === "model") return label;
  if (isModel(label)) return t.models[label];
  if (label === "utility") return t.panel.utility;
  if (label === "classifier") return t.spend.classifier;
  if (label === "helper") return t.spend.helper;
  return label;
}

/**
 * The spend of a run, for admins: collapsed, with the total in its summary; open, the calls so far
 * by agent, model or stage, as bars and as a table. Read again every few seconds while the run
 * runs, and once more when it ends.
 */
export function Spend({ runId, running }: { runId: string; running: boolean }) {
  const { api } = useSession();
  const [spend, setSpend] = useState<RunSpend | null>(null);
  const [failed, setFailed] = useState(false);
  const [pivot, setPivot] = useState<SpendPivot>("agent");
  const id = useId();

  useEffect(() => {
    let live = true;
    const read = () =>
      api.spend(runId).then(
        (s) => {
          if (!live) return;
          setSpend(s);
          setFailed(false);
        },
        () => live && setFailed(true),
      );
    read();
    const timer = running ? setInterval(read, POLL_MS) : null;
    return () => {
      live = false;
      if (timer !== null) clearInterval(timer);
    };
  }, [api, runId, running]);

  const rows: SpendRow[] = spend?.rows[pivot] ?? [];
  const max = Math.max(0, ...rows.map((r) => r.costUsd));
  const by = t.spend.pivots[pivot];

  return (
    <details className="spend" data-testid="spend">
      <summary>
        {t.spend.title}
        {spend && ` · ${t.spend.usd(spend.totalUsd)}`}
        {spend && spend.running > 0 && ` · ${t.spend.running(spend.running)}`}
      </summary>
      {failed && !spend && <p className="error">{t.spend.failed}</p>}
      {!spend && !failed && <p className="muted">{t.common.loading}</p>}
      {spend && rows.length === 0 && <p className="muted">{t.spend.none}</p>}
      {spend && rows.length > 0 && (
        <>
          <div className="spend-pivot">
            <label htmlFor={id}>{t.spend.groupBy}</label>
            <select id={id} value={pivot} onChange={(e) => setPivot(e.target.value as SpendPivot)}>
              {PIVOTS.map((p) => (
                <option key={p} value={p}>
                  {t.spend.pivots[p]}
                </option>
              ))}
            </select>
          </div>
          <div role="img" aria-label={t.spend.chart(by)} className="spend-bars">
            {rows.map((r) => (
              <div key={r.label} className="spend-bar-row">
                <div className="spend-bar-label">
                  <span className="spend-bar-name">{labelOf(pivot, r.label)}</span>
                  <span className="spend-amount">{t.spend.usd(r.costUsd)}</span>
                </div>
                <div className="spend-track" aria-hidden="true">
                  <span
                    className={`spend-bar${pivot === "agent" && isModel(r.label) ? ` ink-${r.label}` : ""}`}
                    style={{ width: `${max ? (r.costUsd / max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="spend-table-wrap">
            <table className="spend-table">
              <caption className="sr-only">{t.spend.caption(by)}</caption>
              <thead>
                <tr>
                  <th scope="col">{by}</th>
                  <th scope="col">{t.spend.columns.calls}</th>
                  <th scope="col">{t.spend.columns.inputTokens}</th>
                  <th scope="col">{t.spend.columns.outputTokens}</th>
                  <th scope="col">{t.spend.columns.usd}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{labelOf(pivot, r.label)}</th>
                    <td>
                      {t.spend.count(r.calls)}
                      {r.running > 0 && ` + ${t.spend.count(r.running)}`}
                    </td>
                    <td>{t.spend.count(r.inputTokens)}</td>
                    <td>{t.spend.count(r.outputTokens)}</td>
                    <td>{t.spend.usd(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">{t.spend.note}</p>
        </>
      )}
    </details>
  );
}

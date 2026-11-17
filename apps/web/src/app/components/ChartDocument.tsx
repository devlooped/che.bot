import { MODELS, type ModelId, type Source } from "@chebot/protocol";
import { useMemo, useRef, useState } from "react";
import type { DrawnRow } from "../chart/embed.ts";
import { t } from "../i18n/index.ts";
import {
  type ChartView,
  cellText,
  drawnColumns,
  formatNumber,
  type RowView,
  type ValueView,
} from "../view/chart.ts";
import { ChartCanvas } from "./ChartCanvas.tsx";
import { LayerSheet } from "./Discussion.tsx";
import { ModelMark, Tally, Votes } from "./ModelMark.tsx";
import { Notes } from "./RunDetails.tsx";

function SourceLink({ source }: { source: Source }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-title">
      {source.title || source.url}
    </a>
  );
}

/** Who gave a value, and who checked its source and said it holds: "Por ■★ 👍●◆". */
function GivenBy({ by, confirmedBy }: { by: readonly ModelId[]; confirmedBy: readonly ModelId[] }) {
  return (
    <Tally
      parts={[
        { kind: "by", lead: t.tally.by, models: by },
        { kind: "confirmed", lead: "👍", label: t.tally.confirmed, models: confirmedBy },
      ]}
    />
  );
}

function verdictText(v: ValueView): string {
  const verdict = t.chart.notes.verdict;
  switch (v.verdict) {
    case "held":
      return verdict.held;
    case "failed":
      return verdict.failed;
    case "partial":
      return verdict.partial(v.holds, v.checkers);
    case "checking":
      return verdict.checking;
    default:
      return verdict.unchecked;
  }
}

/** The note of a row: what happened to its value, each value given with its source and check. */
function RowNote({ row }: { row: RowView }) {
  if (row.note === null) return null;
  return (
    <div className="row-note" id={`nota-${row.note}`} data-testid="row-note" data-kind={row.kind}>
      <p className="row-note-head">
        <strong>{t.chart.note(row.note)}.</strong> {row.noteText}
      </p>
      {row.settledBy && (
        <p className="row-note-settled">
          {t.chart.notes.settledBy} <SourceLink source={row.settledBy} />
        </p>
      )}
      <ul className="row-note-values">
        {row.values.map((v) => (
          <li key={`${v.text}:${v.source?.id ?? ""}`} className="row-note-value">
            <span>
              {t.chart.notes.said(v.text)} {v.source ? <SourceLink source={v.source} /> : null}
              {v.quote && (
                <>
                  {": "}
                  <q className="source-quote">{v.quote}</q>
                </>
              )}{" "}
              <span className={`verdict verdict-${v.verdict}`}>{verdictText(v)}</span>{" "}
              <GivenBy by={v.support} confirmedBy={v.confirmedBy} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The data of a web chart: every row with its value, its source and the words that state it. */
function DataTable({ chart }: { chart: ChartView }) {
  return (
    <section className="chart-data" aria-labelledby="chart-data-title">
      <h3 id="chart-data-title" className="chart-subtitle">
        {t.chart.dataTitle}
      </h3>
      <p className="fine">{t.chart.dataLede}</p>
      <table className="chart-table" aria-labelledby="chart-data-title">
        <thead>
          <tr>
            <th scope="col">{chart.dimension}</th>
            <th scope="col" className="num">
              {chart.measure || t.chart.valueColumn}
            </th>
            <th scope="col">{t.chart.sourceColumn}</th>
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((row) => (
            <RowLines key={row.key} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RowLines({ row }: { row: RowView }) {
  return (
    <>
      <tr className={`chart-row kind-${row.kind}`} data-testid="chart-row" data-kind={row.kind}>
        <th scope="row">
          <span className="row-label">{row.label}</span>
          {row.note !== null && (
            <a className="note-tag" href={`#nota-${row.note}`}>
              {t.chart.note(row.note)}
            </a>
          )}
        </th>
        <td className="num">{row.text}</td>
        <td className="row-source">
          {row.source && <SourceLink source={row.source} />}
          {row.quote && <q className="source-quote">{row.quote}</q>}
          <span className="row-meta">
            <span className={`kind-chip kind-chip-${row.kind}`}>{t.chart.kinds[row.kind]}</span>
            <GivenBy by={row.support} confirmedBy={row.confirmedBy} />
          </span>
        </td>
      </tr>
      {row.note !== null && (
        <tr className="note-line">
          <td colSpan={3}>
            <RowNote row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The layers the models voted on: each opens its discussion; the dissent notes follow. */
function Layers({ chart }: { chart: ChartView }) {
  const [open, setOpen] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  if (chart.layers.length === 0 && chart.dissent.length === 0) return null;
  const opened = chart.layers.find((l) => l.layer === open) ?? null;
  const o = t.chart.layers.outcome;
  return (
    <section className="chart-layers" aria-labelledby="chart-layers-title">
      <h3 id="chart-layers-title" className="chart-subtitle">
        {t.chart.layers.title}
      </h3>
      <p className="fine">{t.chart.layers.lede}</p>
      <ul className="layer-list">
        {chart.layers.map((l) => {
          const outcome = l.state === "accepted" ? o.accepted(l.accepted) : o[l.state];
          return (
            <li key={l.layer}>
              <button
                type="button"
                className={`layer-button layer-${l.state}`}
                aria-haspopup="dialog"
                aria-expanded={open === l.layer}
                data-testid="layer"
                ref={(el) => {
                  if (el) buttons.current.set(l.layer, el);
                  else buttons.current.delete(l.layer);
                }}
                onClick={() => setOpen(l.layer)}
              >
                <span className="layer-head">
                  <span className="layer-name">{l.name}</span>
                  <span className="layer-authors" aria-hidden="true">
                    {l.authors.map((m) => (
                      <ModelMark key={m} model={m} size={10} />
                    ))}
                  </span>
                </span>
                <span className="layer-outcome">{outcome}</span>
                <span className="layer-value">{l.value}</span>
                <span className="sr-only">{t.chart.layers.open}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {chart.dissent.length > 0 && (
        <div className="dissent-notes">
          {chart.dissent.map((d) => {
            const silent = MODELS.filter((m) => !d.holders.includes(m) && !d.keep.includes(m));
            return (
              <aside key={d.suggestion} className={`dissent ink-${d.author}`} data-testid="dissent">
                <p className="dissent-title">
                  <ModelMark model={d.author} size={10} />
                  {t.dissent.title}: {t.chart.layers.names[d.layer]}
                </p>
                <p>
                  {t.dissent.note(t.models[d.author], d.action)}
                  {d.proposed && <q className="dissent-text">{d.proposed}</q>}
                </p>
                <p className="dissent-reason">{d.reason}</p>
                {d.state === "open" ? (
                  <p className="fine">{t.dissent.open}</p>
                ) : (
                  <p className="fine">
                    <Votes holders={d.holders} keep={d.keep} silent={silent} />
                  </p>
                )}
              </aside>
            );
          })}
        </div>
      )}
      {opened && (
        <LayerSheet
          key={opened.layer}
          layer={opened}
          onClose={() => {
            setOpen((current) => (current === opened.layer ? null : current));
            buttons.current.get(opened.layer)?.focus();
          }}
        />
      )}
    </section>
  );
}

/** A chart of the user's table: where its numbers come from, the drawn values and the upload. */
function FromTable({ chart, drawn }: { chart: ChartView; drawn: DrawnRow[] }) {
  const columns = useMemo(() => drawnColumns(chart.chart), [chart.chart]);
  const shown = columns.filter((c) => drawn.some((r) => c.field in r));
  const upload = chart.upload;
  return (
    <section className="chart-data" aria-labelledby="chart-data-title">
      <div className="from-table" data-testid="from-table">
        <p>
          <strong>{t.chart.user.fromTable}</strong>
        </p>
        <p>{t.chart.user.calculation(chart.calculation)}</p>
        {upload && (
          <p className="fine">{t.chart.user.table(upload.rows.length, upload.columns.length)}</p>
        )}
      </div>
      <h3 id="chart-data-title" className="chart-subtitle">
        {t.chart.user.drawnTitle}
      </h3>
      <p className="fine">{t.chart.user.drawnLede}</p>
      {shown.length > 0 && (
        <div className="table-scroll">
          <table className="chart-table chart-table-plain" aria-labelledby="chart-data-title">
            <thead>
              <tr>
                {shown.map((c, i) => (
                  <th key={c.field} scope="col" className={i > 0 ? "num" : undefined}>
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drawn.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the drawn rows have no key of their own
                <tr key={i} data-testid="drawn-row">
                  {shown.map((c, j) =>
                    j === 0 ? (
                      <th key={c.field} scope="row">
                        {cellText(r[c.field], c.temporal)}
                      </th>
                    ) : (
                      <td key={c.field} className="num">
                        {cellText(r[c.field], c.temporal)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {upload && (
        <details className="upload">
          <summary>{t.chart.user.showUpload(upload.rows.length)}</summary>
          <div className="table-scroll">
            <table className="chart-table chart-table-plain">
              <thead>
                <tr>
                  {upload.columns.map((c) => (
                    <th key={c.name} scope="col">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upload.rows.map((r, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the uploaded rows are in their order
                  <tr key={i}>
                    {upload.columns.map((c) => (
                      <td key={c.name} className={c.type === "number" ? "num" : undefined}>
                        {typeof r[c.name] === "number"
                          ? formatNumber(r[c.name] as number)
                          : String(r[c.name] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

/**
 * The answer of a chart run (step 41): the chart of the current version with its title and its
 * explanation, the data under it with a source for every web number, a note on every corrected,
 * disputed or unconfirmed point, and the discussions of the layers the models voted on.
 */
export function ChartDocument({
  chart,
  final,
  notes,
}: {
  chart: ChartView;
  final: boolean;
  notes: readonly string[];
}) {
  const [drawn, setDrawn] = useState<DrawnRow[]>([]);
  const web = chart.origin === "web";
  return (
    <section className="answer chart-answer" aria-labelledby="answer-title">
      <h2 id="answer-title" className="section-title">
        {t.answer.title}
      </h2>
      {!final && <p className="muted">{t.answer.draftNote}</p>}
      <Notes notes={notes} />
      <figure className="chart-figure">
        <h3 className="chart-title" data-testid="chart-title">
          {chart.title}
        </h3>
        <ChartCanvas
          spec={chart.spec}
          data={chart.data}
          label={chart.label}
          onDrawn={web ? undefined : setDrawn}
        />
        {chart.caption && (
          <figcaption className="chart-caption" data-testid="chart-caption">
            {chart.caption}
          </figcaption>
        )}
      </figure>
      {web && chart.notes.length > 0 && <p className="legend">{t.chart.legend}</p>}
      {web ? <DataTable chart={chart} /> : <FromTable chart={chart} drawn={drawn} />}
      <Layers chart={chart} />
    </section>
  );
}

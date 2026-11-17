import { MODELS, type ModelId, type Source } from "@chebot/protocol";
import { useRef, useState } from "react";
import { t } from "../i18n/index.ts";
import type { ChartView, RowView, ValueView } from "../view/chart.ts";
import { ChartCanvas } from "./ChartCanvas.tsx";
import { LayerSheet } from "./Discussion.tsx";
import { ModelMark, Tally, Votes, WithMarks } from "./ModelMark.tsx";

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

/** The anchor of the note `n` of a chart: the notes of every chart of the answer are told apart. */
const noteId = (chart: string, n: number) => `nota-${chart}-${n}`;

/** The note of a row: what happened to its value, each value given with its source and check. */
function RowNote({ chart, row }: { chart: string; row: RowView }) {
  if (row.note === null) return null;
  return (
    <div
      className="row-note"
      id={noteId(chart, row.note)}
      data-testid="row-note"
      data-kind={row.kind}
    >
      <p className="row-note-head">
        <strong>{t.chart.note(row.note)}.</strong>{" "}
        {row.noteText && <WithMarks text={row.noteText} />}
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

/** The data of a chart: every row with its value, its source and the words that state it. */
function DataTable({ chart }: { chart: ChartView }) {
  const title = `${chart.id}-data-title`;
  return (
    // named with the title of its chart too: every chart of the answer has a section of data
    <section className="chart-data" aria-labelledby={`${title} ${chart.id}-title`}>
      <h4 id={title} className="chart-subtitle">
        {t.chart.dataTitle}
      </h4>
      <p className="fine">{t.chart.dataLede}</p>
      <table className="chart-table" aria-labelledby={title}>
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
            <RowLines key={row.key} chart={chart.id} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RowLines({ chart, row }: { chart: string; row: RowView }) {
  return (
    <>
      <tr className={`chart-row kind-${row.kind}`} data-testid="chart-row" data-kind={row.kind}>
        <th scope="row">
          <span className="row-label">{row.label}</span>
          {row.note !== null && (
            <a className="note-tag" href={`#${noteId(chart, row.note)}`}>
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
            <RowNote chart={chart} row={row} />
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
  const title = `${chart.id}-layers-title`;
  return (
    <section className="chart-layers" aria-labelledby={`${title} ${chart.id}-title`}>
      <h4 id={title} className="chart-subtitle">
        {t.chart.layers.title}
      </h4>
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
                  {t.dissent.title}: {t.chart.layers.names[d.layer]}
                </p>
                <p>
                  <WithMarks text={t.dissent.note(t.models[d.author], d.action)} />
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

/**
 * A chart of the answer, in its place among the paragraphs (step 41): the chart of the current
 * version with its title and its explanation, the data under it with a source for every number, a
 * note on every corrected, disputed or unconfirmed point, and the discussions of the layers the
 * models voted on.
 */
export function ChartBlock({ chart }: { chart: ChartView }) {
  return (
    <div className="chart-block" data-testid="chart-block" data-chart={chart.id}>
      <figure className="chart-figure">
        <h3 id={`${chart.id}-title`} className="chart-title" data-testid="chart-title">
          {chart.title}
        </h3>
        <ChartCanvas spec={chart.spec} data={chart.data} label={chart.label} />
        {chart.caption && (
          <figcaption className="chart-caption" data-testid="chart-caption">
            {chart.caption}
          </figcaption>
        )}
      </figure>
      {chart.notes.length > 0 && <p className="legend">{t.chart.legend}</p>}
      <DataTable chart={chart} />
      <Layers chart={chart} />
    </div>
  );
}

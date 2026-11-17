import { CSV_LIMITS, CsvParseError, MODELS_BY_NAME, parseCsv } from "@chebot/protocol";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { ApiError, type ChartRequest, MAX_QUESTION_CHARS } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { ModelMark } from "../components/ModelMark.tsx";
import { t } from "../i18n/index.ts";
import { navigate } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { errorText } from "../view/errors.ts";

const count = new Intl.NumberFormat(t.locale);

/** An uploaded table read and checked in the browser, as the API will check it. */
interface ChosenFile {
  name: string;
  csv: string;
  rows: number;
  columns: number;
}

/** The refusal of a file in plain words, by the code the parser or the API gives. */
function fileError(code: string): string {
  return t.errors.file[code] ?? t.errors.file.unreadable ?? t.errors.generic;
}

/** Reads and checks a CSV the way the API will: the limits, the shape of its rows. */
async function readCsv(file: File): Promise<ChosenFile | { error: string }> {
  if (file.size > CSV_LIMITS.maxBytes) return { error: fileError("too_large") };
  try {
    const csv = await file.text();
    const dataset = parseCsv(csv);
    return { name: file.name, csv, rows: dataset.rows.length, columns: dataset.columns.length };
  } catch (error) {
    return { error: fileError(error instanceof CsvParseError ? error.code : "unreadable") };
  }
}

export function AskPage() {
  const { ready, user, api, signIn, failed } = useSession();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wantChart, setWantChart] = useState(false);
  const [origin, setOrigin] = useState<"web" | "file">("web");
  const [file, setFile] = useState<ChosenFile | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const withFile = wantChart && origin === "file";

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    setFile(null);
    setFileProblem(null);
    setChosenName(chosen?.name ?? null);
    if (!chosen) return;
    setReading(true);
    const read = await readCsv(chosen);
    setReading(false);
    if ("error" in read) setFileProblem(read.error);
    else setFile(read);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text) return setError(t.errors.empty);
    if (text.length > MAX_QUESTION_CHARS)
      return setError(t.errors.tooLong(count.format(MAX_QUESTION_CHARS)));
    if (withFile && !file) return setError(fileProblem ?? t.errors.noFile);
    const chart: ChartRequest | null = !wantChart
      ? null
      : withFile && file
        ? { csv: file.csv }
        : {};
    setSending(true);
    setError(null);
    try {
      const quote = await api.ask(text, chart);
      navigate(runPath(quote.runId));
    } catch (err) {
      // The API words a refused file by its code; a body too large is a file too large.
      if (err instanceof ApiError && err.kind === "bad_file")
        setError(fileError((err.reason ?? "").replace(/^csv_/, "")));
      else if (err instanceof ApiError && err.kind === "too_long" && withFile)
        setError(fileError("too_large"));
      else setError(errorText(err));
      setSending(false);
    }
  }

  return (
    <main className="page ask">
      <section className="hero">
        <ul className="hero-seats" aria-hidden="true">
          {MODELS_BY_NAME.map((m) => (
            <li key={m} className={`ink-${m}`}>
              <ModelMark model={m} size={14} />
              {t.models[m]}
            </li>
          ))}
        </ul>
        <h1 className="hero-title">{t.ask.headline}</h1>
        <p className="hero-lede">{t.ask.lede}</p>
      </section>

      {!ready ? (
        <p className="muted">{t.common.loading}</p>
      ) : user ? (
        <form className="ask-form" onSubmit={submit} noValidate>
          <label htmlFor="question" className="ask-label">
            {t.ask.label}
          </label>
          <textarea
            id="question"
            name="question"
            className="ask-box"
            rows={5}
            maxLength={MAX_QUESTION_CHARS}
            placeholder={t.ask.placeholder}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-describedby="question-count question-note"
          />
          <span id="question-count" className="fine ask-count">
            {t.ask.counter(count.format(question.length), count.format(MAX_QUESTION_CHARS))}
          </span>
          <div className="ask-chart">
            <label className="check">
              <input
                type="checkbox"
                checked={wantChart}
                onChange={(e) => setWantChart(e.target.checked)}
                aria-describedby="chart-hint"
              />
              <span>{t.ask.chart.toggle}</span>
            </label>
            <p id="chart-hint" className="fine">
              {t.ask.chart.toggleHint}
            </p>
            {wantChart && (
              <div className="ask-chart-options">
                <fieldset className="choices">
                  <legend className="choices-legend">{t.ask.chart.dataLegend}</legend>
                  <label className="choice">
                    <input
                      type="radio"
                      name="origin"
                      value="web"
                      checked={origin === "web"}
                      onChange={() => setOrigin("web")}
                    />
                    <span>
                      <span className="choice-name">{t.ask.chart.web}</span>
                      <span className="fine">{t.ask.chart.webHint}</span>
                    </span>
                  </label>
                  <label className="choice">
                    <input
                      type="radio"
                      name="origin"
                      value="file"
                      checked={origin === "file"}
                      onChange={() => setOrigin("file")}
                    />
                    <span>
                      <span className="choice-name">{t.ask.chart.file}</span>
                      <span className="fine">{t.ask.chart.fileHint}</span>
                    </span>
                  </label>
                </fieldset>
                {withFile && (
                  <div className="file-field">
                    <span id="csv-label" className="field-label">
                      {t.ask.chart.fileLabel}
                    </span>
                    {/* The browser's own button speaks the browser's language: a label of ours opens the input. */}
                    <div className="file-pick">
                      <input
                        id="csv-file"
                        type="file"
                        className="file-input"
                        accept=".csv,text/csv,text/plain"
                        onChange={choose}
                        aria-labelledby="csv-label csv-button"
                        aria-describedby="csv-limits csv-status"
                      />
                      <label htmlFor="csv-file" id="csv-button" className="button button-quiet">
                        {t.ask.chart.choose}
                      </label>
                      <span id="csv-status" className="fine" aria-live="polite">
                        {reading
                          ? t.ask.chart.reading
                          : file
                            ? t.ask.chart.fileReady(file.name, file.rows, file.columns)
                            : (chosenName ?? t.ask.chart.noneChosen)}
                      </span>
                    </div>
                    <p id="csv-limits" className="fine">
                      {t.ask.chart.fileLimits}
                    </p>
                    {fileProblem && (
                      <p className="error" role="alert" data-testid="file-error">
                        {fileProblem}
                      </p>
                    )}
                  </div>
                )}
                <p className="fine">{t.ask.chart.samePrice}</p>
              </div>
            )}
          </div>
          <div className="ask-row">
            <button type="submit" className="button button-primary" disabled={sending}>
              {sending ? t.ask.submitting : t.ask.submit}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p id="question-note" className="fine">
            {t.ask.publicNote}
          </p>
        </form>
      ) : (
        <section className="signin-card">
          <p>{t.ask.signInLede}</p>
          {failed && (
            <p className="error" role="alert">
              {t.errors.signInFailed}
            </p>
          )}
          <button type="button" className="button button-primary" onClick={() => signIn("/")}>
            {t.ask.signInToAsk}
          </button>
        </section>
      )}

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">
          {t.ask.howTitle}
        </h2>
        <ol className="how-steps">
          {t.ask.how.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}

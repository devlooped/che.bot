import { MODELS_BY_NAME } from "@chebot/protocol";
import { type FormEvent, useState } from "react";
import { MAX_QUESTION_CHARS } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { ModelMark } from "../components/ModelMark.tsx";
import { t } from "../i18n/index.ts";
import { navigate } from "../router/index.tsx";
import { runPath } from "../routes.tsx";
import { errorText } from "../view/errors.ts";

const count = new Intl.NumberFormat(t.locale);

/** The page to ask, the one of the + of the header: what che.bot does, the question, how it works. */
export function AskPage() {
  const { ready, user, api, signIn, failed } = useSession();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text) return setError(t.errors.empty);
    if (text.length > MAX_QUESTION_CHARS)
      return setError(t.errors.tooLong(count.format(MAX_QUESTION_CHARS)));
    setSending(true);
    setError(null);
    try {
      const quote = await api.ask(text);
      navigate(runPath(quote.runId));
    } catch (err) {
      setError(errorText(err));
      setSending(false);
    }
  }

  return (
    <main className="page">
      <div className="ask">
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
            <button type="button" className="button button-primary" onClick={() => signIn("/new")}>
              {t.ask.signInToAsk}
            </button>
          </section>
        )}
      </div>

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

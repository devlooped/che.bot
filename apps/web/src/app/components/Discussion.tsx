import type { Suggestion } from "@chebot/protocol";
import { type ReactNode, useEffect, useRef } from "react";
import { t } from "../i18n/index.ts";
import { type LayerView, patchText } from "../view/chart.ts";
import type { Discussion, ParagraphView, Position } from "../view/derive.ts";
import { ModelMark, Tally, WithMarks } from "./ModelMark.tsx";

function positionText(position: Position, alternatives: Suggestion[]): string {
  if (position.choice === null) return t.discussion.noVote;
  if (position.choice === "keep") return t.discussion.keep;
  const s = alternatives.find((a) => a.id === position.choice);
  return s ? t.discussion.holds(t.discussion.proposalOf(t.models[s.author])) : t.discussion.noVote;
}

function Outcome({ discussion }: { discussion: Discussion }) {
  const { thread } = discussion;
  const text =
    thread.state === "accepted"
      ? t.discussion.outcome.accepted(thread.tally?.for.length ?? 0)
      : t.discussion.outcome[thread.state];
  return <p className={`outcome outcome-${thread.state}`}>{text}</p>;
}

function Proposal({ s, added }: { s: Suggestion; added: boolean }) {
  // A proposal on a layer of a chart says what it changes in plain words, never its code.
  const patch = s.op === "patch" ? patchText(s) : null;
  const text = patch ? patch.proposed : s.op !== "delete" ? s.text : null;
  return (
    <div className={`proposal ink-${s.author}`}>
      <p className="proposal-head">
        <WithMarks
          text={
            added
              ? t.discussion.addedBy(t.models[s.author])
              : t.discussion.proposal(
                  t.models[s.author],
                  patch ? patch.action : t.discussion.actions[s.op],
                )
          }
        />
      </p>
      {text && <blockquote className="proposal-text">{text}</blockquote>}
      <p className="proposal-why">
        <span className="proposal-why-label">{t.discussion.why}</span> {s.reason}
      </p>
      {s.coAuthors.length > 0 && (
        <p className="fine">
          <WithMarks
            text={t.discussion.alsoProposed(t.modelNames(s.coAuthors), s.coAuthors.length)}
          />
        </p>
      )}
    </div>
  );
}

function DiscussionBlock({ discussion, added }: { discussion: Discussion; added: boolean }) {
  return (
    <section className="discussion" data-testid="discussion">
      {discussion.alternatives.map((s) => (
        <Proposal key={s.id} s={s} added={added} />
      ))}
      <h4 className="positions-title">{t.discussion.positions}</h4>
      <ul className="positions">
        {discussion.positions.map((p) => (
          <li key={p.model} className={`position ink-${p.model}`}>
            <span className="position-who">
              <ModelMark model={p.model} size={11} />
              {t.models[p.model]}
            </span>
            <span className="position-what">
              <WithMarks text={positionText(p, discussion.alternatives)} />
            </span>
            {p.changedBecause && (
              <span className="position-changed">
                <strong>{t.discussion.changed}:</strong> <q>{p.changedBecause}</q>
              </span>
            )}
            {p.saidWhy && (
              <span className="position-said">
                <q>{p.saidWhy}</q>
              </span>
            )}
          </li>
        ))}
      </ul>
      <Outcome discussion={discussion} />
    </section>
  );
}

/** A sheet over the page: a modal dialog that closes with Escape, its button or the backdrop. */
function Sheet({
  title,
  className,
  onClose,
  children,
}: {
  title: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes; Escape and the close button are the keyboard's way
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-labelledby="discussion-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-head">
          <h3 id="discussion-title" className="sheet-title">
            {title}
          </h3>
          <button type="button" className="button button-text" onClick={() => ref.current?.close()}>
            {t.common.close}
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** The discussion of a paragraph, as a sheet: who holds it, the proposals, the reasons, the votes. */
export function DiscussionSheet({
  paragraph,
  onClose,
}: {
  paragraph: ParagraphView;
  onClose: () => void;
}) {
  return (
    <Sheet title={t.discussion.title} className="discussion-sheet" onClose={onClose}>
      <blockquote className="sheet-quote">{paragraph.text}</blockquote>
      <p className="sheet-support">
        <strong>{t.answer.statusName[paragraph.status]}.</strong>{" "}
        <Tally parts={[{ kind: "by", lead: t.tally.by, models: paragraph.support }]} />
      </p>
      {paragraph.before && (
        <div className="sheet-before">
          <p className="fine">{t.discussion.before}</p>
          <blockquote className="sheet-quote sheet-quote-old">{paragraph.before}</blockquote>
        </div>
      )}
      {paragraph.addedBy && <DiscussionBlock discussion={paragraph.addedBy} added />}
      {paragraph.discussions.map((d) => (
        <DiscussionBlock key={d.thread.id} discussion={d} added={false} />
      ))}
      {!paragraph.addedBy && paragraph.discussions.length === 0 && (
        <p className="muted">{t.discussion.noThreads}</p>
      )}
    </Sheet>
  );
}

/** The discussion of a layer of a chart (its kind, title, explanation or calculation), as a sheet. */
export function LayerSheet({ layer, onClose }: { layer: LayerView; onClose: () => void }) {
  return (
    <Sheet
      title={t.chart.layers.sheetTitle[layer.layer]}
      className="discussion-sheet"
      onClose={onClose}
    >
      <p className="fine">{t.chart.layers.now}</p>
      <blockquote className="sheet-quote">{layer.value}</blockquote>
      {layer.before && (
        <div className="sheet-before">
          <p className="fine">{t.discussion.before}</p>
          <blockquote className="sheet-quote sheet-quote-old">{layer.before}</blockquote>
        </div>
      )}
      {layer.discussions.map((d) => (
        <DiscussionBlock key={d.thread.id} discussion={d} added={false} />
      ))}
    </Sheet>
  );
}

// The texts of the verdict over a picture, apart from the rest because the Worker draws them too
// (the picture that a shared link previews, worker/card.ts) and must not import the whole app.
export const verdictEsAR = {
  /** What the question asks: the heading of the votes. */
  kinds: { claim: "Afirmación", question: "Pregunta", fact: "Dato" },
  /** Each rating, by what the question asks (the codes of the protocol, see Rating). */
  ratings: {
    claim: { true: "Verdadero", false: "Falso", depends: "Engañoso", unknown: "Insostenible" },
    question: { true: "Sí", false: "No", depends: "Depende", unknown: "No sé" },
  },
  split: "Dividido",
  /** A model that took the question for a fact: it gave no rating. */
  none: "sin voto",
  /** What a screen reader reads for the card: "Afirmación: Engañoso. Grok: Verdadero; ...". */
  said: (heading: string, votes: readonly string[]) =>
    votes.length ? `${heading}. ${votes.join("; ")}.` : `${heading}.`,
  /** The name of the list of points that sums the answer up, for a screen reader. */
  summary: "En resumen",
};

export type VerdictMessages = typeof verdictEsAR;

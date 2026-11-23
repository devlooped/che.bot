import { QuestionCards } from "../components/QuestionCards.tsx";

/** The home page: every question asked, as cards; the + of the header leads to asking. */
export function HomePage() {
  return (
    <main className="page home">
      <QuestionCards />
    </main>
  );
}

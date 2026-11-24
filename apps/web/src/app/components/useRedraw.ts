import { useState } from "react";
import { useSession } from "../auth/context.tsx";
import { t } from "../i18n/index.ts";
import { errorText } from "../view/errors.ts";

/**
 * Draws the picture of a run again, with today's image model (its owner or an admin): the name of
 * the button, what it says once drawn, and why it failed. `onDrawn` gets the new version.
 */
export function useRedraw(runId: string, hasImage: boolean, onDrawn: (image: string) => void) {
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function redraw() {
    setBusy(true);
    setError(null);
    setSaid("");
    try {
      onDrawn(await api.redraw(runId));
      setSaid(t.home.drawn);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? t.home.drawing : hasImage ? t.home.redraw : t.home.draw;
  return { busy, said, error, label, redraw };
}

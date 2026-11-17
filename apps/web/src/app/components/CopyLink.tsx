import { useState } from "react";
import { t } from "../i18n/index.ts";

/** Copies the public link of a run; `describedBy` names the run when a page lists several. */
export function CopyLink({ url, describedBy }: { url: string; describedBy?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button button-quiet share"
      aria-describedby={describedBy}
      onClick={() => {
        navigator.clipboard
          ?.writeText(url)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? t.common.linkCopied : t.common.copyLink}
    </button>
  );
}

import { useState } from "react";
import { t } from "../i18n/index.ts";
import { CheckIcon, ShareIcon } from "./Icons.tsx";

/**
 * Shares the public link of a run: the share sheet on a touch device (a phone, a tablet), the
 * clipboard on a computer. `describedBy` names the run when a page lists several.
 */
export function ShareLink({ url, describedBy }: { url: string; describedBy?: string }) {
  const [copied, setCopied] = useState(false);
  const label = copied ? t.common.linkCopied : t.common.share;
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={label}
        title={label}
        aria-describedby={describedBy}
        onClick={() => {
          if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
            navigator.share({ url }).catch(() => {});
            return;
          }
          navigator.clipboard
            ?.writeText(url)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        {copied ? <CheckIcon /> : <ShareIcon />}
      </button>
      <span className="sr-only" role="status">
        {copied ? t.common.linkCopied : ""}
      </span>
    </>
  );
}

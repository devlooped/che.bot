import { useState } from "react";
import { t } from "../i18n/index.ts";

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
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          {copied ? (
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          ) : (
            <>
              <circle cx="18" cy="5" r="2.6" />
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="19" r="2.6" />
              <path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
            </>
          )}
        </svg>
      </button>
      <span className="sr-only" role="status">
        {copied ? t.common.linkCopied : ""}
      </span>
    </>
  );
}

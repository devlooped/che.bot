import { type ReactNode, useId, useState } from "react";

/**
 * A section of the run page under its title, which the reader opens and closes. The title stays a
 * heading inside the summary, so the page keeps its outline. Children given as a function render
 * only while the section is open: for content that costs to draw, such as a chart.
 */
export function Fold({
  title,
  open: initial = false,
  className,
  testId,
  children,
}: {
  title: ReactNode;
  open?: boolean;
  className: string;
  testId?: string;
  children: ReactNode | ((open: boolean) => ReactNode);
}) {
  const [open, setOpen] = useState(initial);
  const id = useId();
  return (
    <details
      className={`fold ${className}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      aria-labelledby={`${id}-title`}
      data-testid={testId}
    >
      <summary className="fold-summary">
        <h2 id={`${id}-title`} className="section-title">
          {title}
        </h2>
      </summary>
      <div className="fold-body">{typeof children === "function" ? children(open) : children}</div>
    </details>
  );
}

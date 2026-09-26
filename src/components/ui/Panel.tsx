import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Section heading — the home dashboard passes the module label; a
   * module's own page omits it (its page <h1> already names it). */
  title?: string;
  /** Small muted line under/next to the title (counts, "as of" info). */
  description?: ReactNode;
  /** Right-aligned header controls (refresh button, links). */
  actions?: ReactNode;
}

/**
 * The primary dashboard surface: one per module. It is also a CSS
 * container (`@container`), so everything inside lays out against the
 * panel's own width rather than the viewport — the same widget has to work
 * in a narrow bento cell on the home page and full-width on its own page.
 * Inner items should use Card variant="inset", not another raised Card.
 */
export function Panel({ title, description, actions, className, children, ...props }: PanelProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={clsx(
        "@container flex min-w-0 flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6",
        className,
      )}
      {...props}
    >
      {hasHeader && (
        <header className="flex min-h-8 items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-tight text-text">{title}</h2>}
            {description && <div className="mt-0.5 text-xs text-text-muted">{description}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export default Panel;

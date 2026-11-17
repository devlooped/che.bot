import type { RunView } from "@chebot/protocol";
import type { RunSummary } from "../api.ts";
import { t } from "../i18n/index.ts";
import { QrCode } from "./QrCode.tsx";

/** What happens before the run: the class and its price, then the QR and the wait for payment. */
export function Checkout({
  view,
  summary,
  admin,
  paying,
  error,
  onPay,
  onSimulatePayment,
  onSimulateExpiry,
  askingAgain,
  onAskAgain,
}: {
  view: RunView;
  summary: RunSummary;
  admin: boolean;
  paying: boolean;
  error: string | null;
  onPay: () => void;
  onSimulatePayment?: (() => void) | undefined;
  onSimulateExpiry?: (() => void) | undefined;
  askingAgain: boolean;
  onAskAgain: () => void;
}) {
  const quote = view.quote ?? {
    class: summary.class,
    amount: summary.amount,
    currency: summary.currency,
  };
  const price = t.money(quote.amount, quote.currency);
  const awaiting = summary.status === "awaiting_payment" || view.status === "awaiting_payment";

  if (view.status === "expired" || summary.status === "expired")
    return (
      <section
        className="checkout checkout-expired"
        aria-labelledby="expired-title"
        data-testid="expired"
      >
        <h2 id="expired-title" className="checkout-class">
          {t.payment.expired}
        </h2>
        {summary.mine && (
          <>
            <p className="muted">{t.payment.askAgainNote}</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="button button-primary"
              disabled={askingAgain}
              onClick={onAskAgain}
            >
              {askingAgain ? t.payment.askingAgain : t.payment.askAgain}
            </button>
          </>
        )}
      </section>
    );
  if (view.paid) return <p className="notice notice-ok">{t.payment.confirmed}</p>;
  if (!summary.mine)
    return <p className="notice">{awaiting ? t.payment.waitingOther : t.quote.notPaidYet}</p>;

  if (!awaiting)
    return (
      <section className="checkout" aria-labelledby="quote-title" data-testid="quote">
        <h2 id="quote-title" className="checkout-class">
          {t.quote.yourQuestion(t.quote.classes[quote.class])}
        </h2>
        <p className="checkout-why">{t.quote.classWhy[quote.class]}</p>
        <p className="checkout-price" data-testid="price">
          {price}
        </p>
        <p className="muted">{t.quote.sameProcess}</p>
        {admin && <p className="muted">{t.quote.adminNote}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="button button-primary" disabled={paying} onClick={onPay}>
          {paying ? t.quote.paying : admin ? t.quote.adminRun : t.quote.pay(price)}
        </button>
        <p className="fine">{t.ask.publicNote}</p>
      </section>
    );

  return (
    <section className="checkout checkout-qr" aria-labelledby="pay-title" data-testid="payment">
      <h2 id="pay-title" className="checkout-class">
        {t.payment.title}
      </h2>
      <div className="qr-frame">
        {view.payment ? (
          <QrCode value={view.payment.qr} label={t.payment.qrLabel(price)} />
        ) : (
          <p className="qr-pending">{t.payment.preparing}</p>
        )}
      </div>
      <p className="checkout-price">{t.payment.total(price)}</p>
      <p>{t.payment.scan}</p>
      <p className="waiting" role="status">
        <span className="pulse" aria-hidden="true" />
        {t.payment.waiting}
      </p>
      <p className="muted">{t.payment.afterPay}</p>
      <p className="fine">{t.payment.expiresNote}</p>
      {onSimulatePayment && view.payment && (
        <div className="local-actions">
          <button type="button" className="button button-quiet" onClick={onSimulatePayment}>
            {t.local.pay}
          </button>
          {onSimulateExpiry && (
            <button type="button" className="button button-text" onClick={onSimulateExpiry}>
              {t.local.expire}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

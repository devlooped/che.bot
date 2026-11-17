import type { ModelId, QuestionClass } from "@chebot/protocol";
import { type FormEvent, useEffect, useState } from "react";
import { type AdminModels, ApiError, type ModelChoice, type Price } from "../api.ts";
import { useSession } from "../auth/context.tsx";
import { isAdmin } from "../auth/types.ts";
import { ModelMark } from "../components/ModelMark.tsx";
import { t } from "../i18n/index.ts";
import { errorText, fieldErrorText } from "../view/errors.ts";

const CLASSES: QuestionClass[] = ["simple", "complex"];

/** A role in the form: a family, or "" for the default; the effort ("" for none). */
interface RoleForm {
  family: string;
  effort: string;
}

const formOf = (models: AdminModels): Record<string, RoleForm> =>
  Object.fromEntries(
    models.roles.map((r) => [
      r.role,
      { family: r.setting?.family ?? "", effort: r.setting?.effort ?? "" },
    ]),
  );

const effortName = (effort: string | null) =>
  effort ? (t.admin.efforts[effort] ?? effort) : t.admin.noEffort;

const panelModel = (role: string) =>
  role.startsWith("panel.") ? (role.slice("panel.".length) as ModelId) : null;

/** The refusals of a 400, by field, in plain words; null for any other error. */
function fieldsOf(error: unknown): Record<string, string> | null {
  if (!(error instanceof ApiError) || error.kind !== "invalid") return null;
  return Object.fromEntries(
    Object.entries(error.fields).map(([field, message]) => [field, fieldErrorText(message)]),
  );
}

function Models({ initial }: { initial: AdminModels }) {
  const { api } = useSession();
  const [models, setModels] = useState(initial);
  const [form, setForm] = useState(() => formOf(initial));
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const set = (role: string, change: Partial<RoleForm>) =>
    setForm((f) => ({ ...f, [role]: { ...(f[role] ?? { family: "", effort: "" }), ...change } }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const changes: Record<string, ModelChoice | null> = {};
    for (const r of models.roles) {
      const want = form[r.role] ?? { family: "", effort: "" };
      const choice = want.family ? { family: want.family, effort: want.effort || null } : null;
      const same =
        choice === null
          ? r.setting === null
          : r.setting?.family === choice.family && r.setting.effort === choice.effort;
      if (!same) changes[r.role] = choice;
    }
    setError(null);
    setFields({});
    if (Object.keys(changes).length === 0) return setSaid(t.admin.noChanges);
    setSaid("");
    setSaving(true);
    try {
      const saved = await api.saveModels(changes);
      setModels(saved);
      setForm(formOf(saved));
      setSaid(t.admin.savedModels);
    } catch (err) {
      setFields(fieldsOf(err) ?? {});
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={save} noValidate aria-labelledby="models-title">
      <h2 id="models-title" className="section-title">
        {t.admin.modelsTitle}
      </h2>
      {models.roles.map((r) => {
        const want = form[r.role] ?? { family: "", effort: "" };
        const families = models.families.filter((f) => f.kind === r.kind);
        const chosen = families.find((f) => f.family === (want.family || r.default.family));
        const efforts = want.family ? (chosen?.efforts ?? []) : [];
        const seat = panelModel(r.role);
        const id = r.role.replace(/\W/g, "-");
        const what = seat
          ? t.admin.roleWhat.panel
          : r.role === "utility"
            ? t.admin.roleWhat.utility
            : t.admin.roleWhat.classifier;
        const err = fields[r.role];
        return (
          <fieldset key={r.role} className={`role${seat ? ` ink-${seat}` : ""}`} data-testid="role">
            <legend className="role-name">
              {seat && <ModelMark model={seat} size={12} />}
              {t.admin.roles[r.role] ?? r.role}
            </legend>
            <p className="fine role-what">{what}</p>
            <div className="role-fields">
              <div className="field">
                <label htmlFor={`${id}-family`} className="field-label">
                  {t.admin.family}
                </label>
                <select
                  id={`${id}-family`}
                  value={want.family}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={`${id}-today${err ? ` ${id}-error` : ""}`}
                  onChange={(e) => set(r.role, { family: e.target.value, effort: "" })}
                >
                  <option value="">{t.admin.byDefault(r.default.family)}</option>
                  {families.map((f) => (
                    <option key={f.family} value={f.family}>
                      {f.family}
                    </option>
                  ))}
                </select>
              </div>
              {r.kind !== "decision" && (
                <div className="field">
                  <label htmlFor={`${id}-effort`} className="field-label">
                    {t.admin.effort}
                  </label>
                  <select
                    id={`${id}-effort`}
                    value={want.effort}
                    disabled={!want.family}
                    onChange={(e) => set(r.role, { effort: e.target.value })}
                  >
                    {want.family ? (
                      <>
                        <option value="">{t.admin.noEffort}</option>
                        {efforts.map((effort) => (
                          <option key={effort} value={effort}>
                            {effortName(effort)}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value="">
                        {r.default.effort
                          ? t.admin.byDefault(effortName(r.default.effort))
                          : t.admin.noEffort}
                      </option>
                    )}
                  </select>
                </div>
              )}
            </div>
            <p id={`${id}-today`} className="fine">
              {want.family ? t.admin.today(chosen?.latest ?? want.family) : t.admin.usesDefault}
            </p>
            {err && (
              <p id={`${id}-error`} className="error">
                {err}
              </p>
            )}
            {want.family && (
              <button
                type="button"
                className="button button-text"
                onClick={() => set(r.role, { family: "", effort: "" })}
              >
                {t.admin.backToDefault}
              </button>
            )}
          </fieldset>
        );
      })}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-save">
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? t.admin.saving : t.admin.saveModels}
        </button>
        <p className="fine" role="status">
          {said}
        </p>
      </div>
    </form>
  );
}

function Prices({ initial }: { initial: Price[] }) {
  const { api } = useSession();
  const amountOf = (prices: Price[]) =>
    Object.fromEntries(
      CLASSES.map((c) => [c, String(prices.find((p) => p.class === c)?.amount ?? "")]),
    );
  const [prices, setPrices] = useState(initial);
  const [form, setForm] = useState<Record<string, string>>(() => amountOf(initial));
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save(e: FormEvent) {
    e.preventDefault();
    const changes: Partial<Record<QuestionClass, number | null>> = {};
    for (const c of CLASSES) {
      const now = prices.find((p) => p.class === c)?.amount;
      const raw = (form[c] ?? "").trim().replace(/\./g, "");
      // Sent as written: the API says what is wrong with it.
      const amount = raw === "" ? Number.NaN : Number(raw);
      if (amount !== now) changes[c] = Number.isFinite(amount) ? amount : null;
    }
    setError(null);
    setFields({});
    if (Object.keys(changes).length === 0) return setSaid(t.admin.noChanges);
    setSaid("");
    setSaving(true);
    try {
      const saved = await api.savePrices(changes);
      setPrices(saved);
      setForm(amountOf(saved));
      setSaid(t.admin.savedPrices);
    } catch (err) {
      setFields(fieldsOf(err) ?? {});
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={save} noValidate aria-labelledby="prices-title">
      <h2 id="prices-title" className="section-title">
        {t.admin.pricesTitle}
      </h2>
      <div className="price-fields">
        {CLASSES.map((c) => {
          const err = fields[c];
          return (
            <div key={c} className="field">
              <label htmlFor={`price-${c}`} className="field-label">
                {t.admin.priceLabel[c]}
              </label>
              <input
                id={`price-${c}`}
                className="price-input"
                inputMode="numeric"
                autoComplete="off"
                value={form[c] ?? ""}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `price-${c}-error` : undefined}
                onChange={(e) => setForm((f) => ({ ...f, [c]: e.target.value }))}
              />
              {err && (
                <p id={`price-${c}-error`} className="error">
                  {err}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-save">
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? t.admin.saving : t.admin.savePrices}
        </button>
        <p className="fine" role="status">
          {said}
        </p>
      </div>
    </form>
  );
}

/** The admin page (step 34): the model of each role and the two prices. Admins only. */
export function AdminPage() {
  const { ready, user, api, signIn } = useSession();
  const admin = isAdmin(user);
  const [data, setData] = useState<{ models: AdminModels; prices: Price[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !admin) return;
    let live = true;
    Promise.all([api.models(), api.prices()])
      .then(([models, prices]) => live && setData({ models, prices }))
      .catch((e: unknown) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [api, ready, admin]);

  return (
    <main className="page page-narrow admin">
      <h1 className="page-title">{t.admin.title}</h1>
      {!ready ? (
        <p className="muted">{t.common.loading}</p>
      ) : !user ? (
        <section className="signin-card">
          <p>{t.admin.signIn}</p>
          <button type="button" className="button button-primary" onClick={() => signIn()}>
            {t.nav.signIn}
          </button>
        </section>
      ) : !admin ? (
        <p className="notice" data-testid="not-admin">
          {t.errors.notAdmin}
        </p>
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="muted">{t.common.loading}</p>
      ) : (
        <>
          <p className="muted admin-lede">{t.admin.lede}</p>
          <Prices initial={data.prices} />
          <Models initial={data.models} />
        </>
      )}
    </main>
  );
}

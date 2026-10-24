import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { listPricingRules, resetPricingRule, savePricingRule } from "../api/client";

/** Bibliothèque agence › DPGF › Règles de chiffrage : ce que l'agence inclut dans le prix principal ou chiffre à part.
 *  Même architecture que la bibliothèque CCTP : règle SYSTÈME + surcharge AGENCE ; chaque projet peut ensuite déroger pour lui seul. */
export function PricingRules() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = () => listPricingRules().then(setData).catch((reason) => setError(reason.message));
  useEffect(() => { load(); }, []);
  const change = async (rule, policy) => {
    setError(""); setMessage("");
    try { setData(policy === "RESET" ? await resetPricingRule(rule.code) : await savePricingRule(rule.code, policy)); setMessage("Règle enregistrée : elle s’applique aux prochains DPGF, sans modifier les projets qui ont leur propre choix."); }
    catch (reason) { setError(reason.message); }
  };
  if (!data) return <section className="settings-section" data-pricing-rules><p className="panel-empty">{error || "Chargement…"}</p></section>;
  const byLot = data.rules.reduce((groups, rule) => ({ ...groups, [rule.lotLabel]: [...(groups[rule.lotLabel] || []), rule] }), {});
  return <section className="settings-section pricing-rules" data-pricing-rules>
    <h2>Règles de chiffrage</h2>
    <p>Ce que votre agence inclut dans le prix principal ou chiffre à part. Ces règles s’appliquent à chaque nouvelle génération de bordereau ; un projet peut y déroger sans les modifier.</p>
    {!data.canEdit && <p className="library-note" data-pricing-readonly>Lecture seule : seuls les administrateurs de la bibliothèque modifient ces règles.</p>}
    {error && <div className="err" role="alert">{error}</div>}
    {message && <div className="price-message" data-pricing-message>{message}</div>}
    {Object.entries(byLot).map(([lot, rules]) => <div key={lot} className="pricing-lot" data-pricing-lot>
      <h3>{lot}</h3>
      <ul>{rules.map((rule) => <li key={rule.code} data-pricing-rule={rule.code}>
        <span className="who"><b>{rule.label}</b><small>{rule.hint}</small>{rule.version > 0 && <small className="rule-version" data-pricing-version>{rule.agency ? "Règle agence" : "Règle système"} v{rule.version}{rule.updatedBy ? ` · ${rule.updatedBy}` : ""}</small>}
          {rule.history.length > 1 && <details className="rule-history" data-pricing-history><summary>Historique ({rule.history.length} versions)</summary><ol>{rule.history.map((entry) => <li key={entry.version}>V{entry.version} · {entry.policyLabel}{entry.at ? ` · ${new Date(entry.at).toLocaleDateString("fr-FR")}` : ""}{entry.by ? ` · ${entry.by}` : ""}</li>)}</ol></details>}</span>
        <span className="actions">
          <select data-pricing-policy value={rule.effective} disabled={!data.canEdit} aria-label={`Règle pour ${rule.label}`} onChange={(event) => change(rule, event.target.value)}>
            {Object.entries(data.policies).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {rule.agency && data.canEdit && <button type="button" data-pricing-reset title="Revenir à la règle système" onClick={() => change(rule, "RESET")}><RotateCcw size={13} /> Règle système</button>}
        </span>
      </li>)}</ul>
    </div>)}
  </section>;
}

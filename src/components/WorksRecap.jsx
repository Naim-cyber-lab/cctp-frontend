import { useState } from "react";
import { Check, Copy, Layers3 } from "lucide-react";
import { MISSING, RECAP_COLUMNS, buildRecap, recapTsv } from "../utils/worksRecap";

export function WorksRecap({ works, familyLabel, onFix, onCreate }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const recap = buildRecap(works, familyLabel);
  const missing = recap.reduce((sum, row) => sum + row.cells.filter((cell) => cell.missing).length, 0);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recapTsv(recap));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible : autorisez l’accès au presse-papiers.");
    }
  };
  if (!works.length)
    return (
      <section className="pl-recap" data-recap>
        <div className="pl-works-empty">
          <Layers3 size={26} />
          <b>Aucun ouvrage à récapituler</b>
          <p>Créez vos ouvrages : ils apparaîtront ici sous forme de tableau.</p>
          <button className="primary" onClick={onCreate}>Créer mon premier ouvrage</button>
        </div>
      </section>
    );
  return (
    <section className="pl-recap" data-recap>
      <header>
        <span>
          <b>Récapitulatif de vos {works.length} ouvrage{works.length > 1 ? "s" : ""}</b>
          <small>
            {missing
              ? `${missing} information${missing > 1 ? "s" : ""} « ${MISSING} » : cliquez dessus pour la renseigner. Rien n’est inventé.`
              : "Toutes les informations du tableau sont renseignées."}
          </small>
        </span>
        <div>
          <button type="button" className="secondary" data-recap-copy onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </header>
      {error && <div className="login-error">{error}</div>}
      <div className="pl-recap-scroll">
        <table>
          <thead>
            <tr>{RECAP_COLUMNS.map((name) => <th key={name}>{name}</th>)}</tr>
          </thead>
          <tbody>
            {recap.map((row, index) => (
              <tr key={row.id}>
                {row.cells.map((cell, column) =>
                  cell.missing ? (
                    <td key={column}>
                      <button type="button" className="pl-recap-missing" onClick={() => onFix(works[index], cell.question)} title="Renseigner cette information">
                        {MISSING}
                      </button>
                    </td>
                  ) : (
                    <td key={column} className={column === 0 ? "pl-recap-ref" : undefined}>{cell.value}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

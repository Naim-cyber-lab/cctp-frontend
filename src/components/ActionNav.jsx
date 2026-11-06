import { useState } from "react";

/** Porte d'entrée vers le résultat d'une action de l'assistant (AI-ACTION-NAV-01) : « Voir la modification » (une zone) ou « Voir les modifications » (plusieurs : panneau par section,
 *  parcours précédente / suivante), et « Annuler ». Les cibles sont des blocs à identifiant stable (data-block-id) : si le bloc a disparu depuis, un message clair remplace une erreur. */
export function ActionNav({ result, onGo, onUndo, canUndo }) {
  const targets = result.affected_targets || [];
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [missing, setMissing] = useState(false);
  const go = (position) => {
    if (!targets.length) return;
    const bounded = ((position % targets.length) + targets.length) % targets.length;
    setIndex(bounded);
    setMissing(!onGo(targets[bounded].target_id));
  };
  const sections = [];
  targets.forEach((target, position) => {
    const known = sections.find((section) => section.name === target.section);
    if (known) known.count += 1;
    else sections.push({ name: target.section, count: 1, first: position });
  });
  if (!targets.length && !(canUndo && !result.undone) && !result.undone) return null;
  return <div className="ai-action-nav" data-action-nav data-action-status={result.status}>
    <p className="ai-action-nav-row">
      {result.undone && <span data-action-undone>↶ Modification annulée</span>}
      {targets.length === 1 && <button type="button" className="link-button strong" data-action-view onClick={() => go(0)}>{result.undone ? "Voir la zone concernée" : "Voir la modification →"}</button>}
      {targets.length > 1 && <button type="button" className="link-button strong" data-action-view aria-expanded={open} onClick={() => { setOpen(!open); if (!open) go(0); }}>{result.undone ? "Voir la zone concernée" : "Voir les modifications"}</button>}
      {!result.undone && canUndo && <><span aria-hidden="true">·</span><button type="button" className="link-button" data-action-undo onClick={onUndo}>Annuler</button></>}
    </p>
    {open && targets.length > 1 && <div className="ai-action-panel" data-action-panel>
      <b>Modifications réalisées</b>
      <ul>{sections.map((section) => <li key={`${section.name}-${section.first}`}><button type="button" className="link-button" data-action-section onClick={() => go(section.first)}>{section.name}</button> — {section.count}</li>)}</ul>
      <p className="ai-action-pager">
        <button type="button" className="link-button" data-action-prev onClick={() => go(index - 1)}>← Précédente</button>
        <span data-action-position>{index + 1} / {targets.length}</span>
        <button type="button" className="link-button" data-action-next onClick={() => go(index + 1)}>Suivante →</button>
      </p>
    </div>}
    {missing && <p className="ai-action-missing" data-action-missing role="status">Cette zone a été modifiée ou supprimée depuis cette action.</p>}
  </div>;
}

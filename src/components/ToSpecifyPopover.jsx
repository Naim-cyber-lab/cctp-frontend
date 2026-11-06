import { useEffect, useMemo, useRef, useState } from "react";
import { assistantPrompt, contextOf, guidanceFor } from "../utils/toSpecify";

/** Aide au clic sur un « [À PRÉCISER] » : ce qu'il faut renseigner, où le trouver, et quatre façons d'avancer (saisir, questionnaire, assistant, document). */
export function ToSpecifyPopover({ node, onClose, onReplace, onOpenQuestion, onAsk, onAttach }) {
  const guidance = useMemo(() => guidanceFor(node.textContent, contextOf(node)), [node]);
  const [value, setValue] = useState("");
  const popover = useRef(null);
  const rect = node.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const below = rect.bottom + 8 + 360 < window.innerHeight;
  useEffect(() => {
    const away = (event) => { if (!popover.current?.contains(event.target) && !node.contains(event.target)) onClose(); };
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [node, onClose]);
  const contradiction = guidance.kind === "CONTRADICTION";
  return (
    <div ref={popover} className="to-specify-popover" role="dialog" aria-label="Comment préciser cette information" data-to-specify-popover
      style={{ position: "fixed", left, width, ...(below ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }) }}>
      <h4 data-to-specify-topic>{guidance.topic}</h4>
      <p data-to-specify-what>{guidance.what}</p>
      {guidance.where?.length > 0 && <>
        <b>Où le trouver</b>
        <ul data-to-specify-where>{guidance.where.map((item) => <li key={item}>{item}</li>)}</ul>
      </>}
      {guidance.example && <p className="to-specify-example" data-to-specify-example><b>Exemple de forme</b> (à adapter, pas une valeur à recopier) : {guidance.example}</p>}
      {!contradiction && (
        <form onSubmit={(event) => { event.preventDefault(); if (value.trim()) onReplace(node, value.trim()); }}>
          <label>Saisir la valeur ici
            <input value={value} data-to-specify-input placeholder={guidance.example ? `ex. ${guidance.example}` : "Valeur ou texte à insérer"} onChange={(event) => setValue(event.target.value)} />
          </label>
          <button type="submit" className="primary" data-to-specify-apply disabled={!value.trim()}>Remplacer dans le texte</button>
        </form>
      )}
      <div className="to-specify-actions">
        {guidance.questionId && <button type="button" data-to-specify-question onClick={() => { onOpenQuestion(guidance.questionId); onClose(); }}>Répondre dans le questionnaire</button>}
        <button type="button" data-to-specify-ask onClick={() => { onAsk(assistantPrompt(guidance)); onClose(); }}>Demander à l’assistant</button>
        <button type="button" data-to-specify-attach onClick={() => { onAttach(); onClose(); }}>Joindre un document</button>
        <button type="button" data-to-specify-leave onClick={onClose}>Laisser à préciser</button>
      </div>
    </div>
  );
}

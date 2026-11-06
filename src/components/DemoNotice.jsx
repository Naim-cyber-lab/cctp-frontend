import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

const TEXT = {
  dpgf: "Projet exemple : les quantités et les prix de ce DPGF sont des données de démonstration (hypothèses et benchmark hors région), pas des valeurs extraites du CCTP.",
  feasibility: "Projet exemple : surfaces, niveaux et quantités du cadrage sont des hypothèses de démonstration ; seule la surface existante provient du dossier public.",
};

/** Mention « Donnée de démonstration » : visible uniquement sur le projet exemple, jamais sur un vrai projet. */
export function DemoNotice({ projectId, kind }) {
  const [demo, setDemo] = useState(false);
  useEffect(() => { let live = true; apiFetch(`/cctps/${projectId}`).then((full) => { if (live) setDemo(Boolean(full?.sections?.__document?.seedKey)); }).catch(() => {}); return () => { live = false; }; }, [projectId]);
  return demo ? <p className="demo-notice" data-demo-notice={kind} role="note" style={{ margin: "6px 0", padding: "6px 10px", background: "#fff7e0", border: "1px solid #ecd9a0", borderRadius: 8, fontSize: 13 }}>{TEXT[kind]}</p> : null;
}

const NODES = [
  {
    id: "classify_edit",
    title: "1 · classify_edit",
    text: "Analyse la demande : si c'est un simple ajout d'information (ex. « ajoute une exigence de 47dB »), applique des règles déterministes toutes faites, sans appeler le modèle IA. Sinon, route vers le pipeline complet.",
  },
  {
    id: "index_documents",
    title: "2 · index_documents",
    text: "Indexe les pièces jointes du projet (PDF, plans, devis...) pour qu'elles deviennent interrogeables dans les étapes suivantes.",
  },
  {
    id: "search_referential",
    title: "3 · search_referential",
    text: "Interroge le référentiel métier Plâtrerie déjà validé (normes, prescriptions types) pour trouver les clauses applicables à la demande.",
  },
  {
    id: "search_documents",
    title: "4 · search_documents",
    text: "Recherche dans les documents du projet (ceux indexés à l'étape 2) les passages pertinents pour la demande.",
  },
  {
    id: "inspect_context",
    title: "5 · inspect_context",
    text: "Contrôle les informations réunies : signale les manques, valeurs suspectes ou contradictions avant de rédiger, pour éviter d'inventer des données.",
  },
  {
    id: "assemble_context",
    title: "6 · assemble_context",
    text: "Assemble tout (références, passages, avertissements) en un contexte final, transmis ensuite au modèle IA pour rédiger le texte.",
  },
];

const EDGES = [
  {
    title: "__start__ → classify_edit",
    text: "Point d'entrée : chaque demande de modification du chapitre Plâtrerie commence ici.",
  },
  {
    title: "classify_edit → __end__  (condition « done »)",
    text: "Raccourci : la demande était un simple ajout, déjà traité par des règles fixes. Le graphe s'arrête sans jamais solliciter le modèle IA — c'est rapide et 100% prévisible.",
  },
  {
    title: "classify_edit → index_documents  (condition « rag »)",
    text: "La demande nécessite une réécriture ou une rédaction plus complète : on part chercher du contexte avant de générer quoi que ce soit.",
  },
  {
    title: "index_documents → search_referential → search_documents → inspect_context → assemble_context",
    text: "Chaîne linéaire : chaque étape enrichit le contexte avec une source différente (référentiel métier, documents projet), puis le contrôle avant assemblage final.",
  },
  {
    title: "assemble_context → __end__",
    text: "Le contexte est prêt ; il est renvoyé à l'appelant qui déclenche alors la génération du texte par le modèle IA (Ollama).",
  },
];

export function PlatrerieGraphDiagram() {
  return (
    <div className="platrerie-graph">
      <svg viewBox="0 0 720 760" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#526b60" />
          </marker>
        </defs>
        <style>{`
          .pg-node{fill:#f2f0ff;stroke:#7c6fe0;stroke-width:1.5;rx:12}
          .pg-endpoint{fill:#1b2f29}
          .pg-label{font:600 14px Manrope,sans-serif;fill:#1b2f29;text-anchor:middle}
          .pg-endlabel{font:700 13px Manrope,sans-serif;fill:#f4f3ee;text-anchor:middle}
          .pg-edge{stroke:#526b60;stroke-width:1.8;fill:none;marker-end:url(#pg-arrow)}
          .pg-edgecond{stroke:#c9873c;stroke-width:1.8;fill:none;stroke-dasharray:5,4;marker-end:url(#pg-arrow)}
          .pg-edgelabel{font:700 11.5px Manrope,sans-serif;fill:#8a5a1f;text-anchor:middle}
        `}</style>
        <ellipse cx="360" cy="30" rx="60" ry="22" className="pg-endpoint" />
        <text x="360" y="35" className="pg-endlabel">__start__</text>
        <rect x="270" y="90" width="180" height="46" className="pg-node" />
        <text x="360" y="118" className="pg-label">classify_edit</text>
        <path d="M360,136 C360,170 220,180 220,210" className="pg-edgecond" />
        <text x="255" y="175" className="pg-edgelabel">rag</text>
        <path d="M420,113 C560,113 560,690 400,706" className="pg-edgecond" />
        <text x="565" y="400" className="pg-edgelabel">done</text>
        <rect x="130" y="212" width="180" height="46" className="pg-node" />
        <text x="220" y="240" className="pg-label">index_documents</text>
        <path d="M220,258 L220,296" className="pg-edge" />
        <rect x="130" y="298" width="180" height="46" className="pg-node" />
        <text x="220" y="326" className="pg-label">search_referential</text>
        <path d="M220,344 L220,382" className="pg-edge" />
        <rect x="130" y="384" width="180" height="46" className="pg-node" />
        <text x="220" y="412" className="pg-label">search_documents</text>
        <path d="M220,430 L220,468" className="pg-edge" />
        <rect x="130" y="470" width="180" height="46" className="pg-node" />
        <text x="220" y="498" className="pg-label">inspect_context</text>
        <path d="M220,516 L220,554" className="pg-edge" />
        <rect x="130" y="556" width="180" height="46" className="pg-node" />
        <text x="220" y="584" className="pg-label">assemble_context</text>
        <path d="M220,602 C220,650 340,690 340,706" className="pg-edge" />
        <ellipse cx="360" cy="726" rx="55" ry="22" className="pg-endpoint" />
        <text x="360" y="731" className="pg-endlabel">__end__</text>
      </svg>
      <div className="platrerie-graph-legend">
        <h3>Nœuds</h3>
        <dl>
          {NODES.map((node) => (
            <div key={node.id}>
              <dt>{node.title}</dt>
              <dd>{node.text}</dd>
            </div>
          ))}
        </dl>
        <h3>Arêtes</h3>
        <dl>
          {EDGES.map((edge) => (
            <div key={edge.title}>
              <dt>{edge.title}</dt>
              <dd>{edge.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, Check, Info, Search, X } from "lucide-react";
import { TeamQuestionnaireEditor } from "../components/TeamQuestionnaireEditor";
import { PriceReferences } from "../components/PriceReferences";
import { PricingRules } from "../components/PricingRules";
import { WorkTemplates } from "../components/WorkTemplates";
import { AgencyClauses } from "../components/AgencyClauses";
import { deleteTeamClause, getOrganization, listTeamClauses, proposeTeamClause, rejectTeamClause, validateTeamClause } from "../api/client";
import { useWorkspaces } from "../hooks/useWorkspaces";
import "../team.css";

// Bibliothèque agence = conteneur commun ; les domaines CCTP et DPGF restent séparés.
const GROUPS = [["cctp", "CCTP", [["questions", "Questions & règles"], ["clauses", "Clauses"], ["types", "Modèles d’ouvrages"]]], ["estimation", "DPGF", [["references", "Références de prix"], ["pricing", "Règles de chiffrage"]]]];
const STATUS = { proposed: "À valider", validated: "Validée", rejected: "Refusée" };

/** Bibliothèque agence : le référentiel de l'agence, en deux domaines séparés — CCTP (questions & règles, clauses, modèles d'ouvrages) et DPGF (références de prix, règles de chiffrage).
 *  Par défaut un administrateur l'édite ; un membre le consulte (édition selon le droit « bibliothèque ») ; un lecteur le lit seulement. `kind="estimation"` ouvre directement le domaine Estimation. */
export function AgencyLibraryPage({ user, onOpenSettings, kind = "cctp", insertContext = null, onUseInCctp }) {
  const { isAgency, active } = useWorkspaces();
  const [team, setTeam] = useState(null);
  const groups = isAgency ? GROUPS : GROUPS.filter(([id]) => id === "estimation"); // sans agence : seules les références de prix et les règles de chiffrage personnelles existent
  const [section, setSection] = useState(kind === "estimation" ? "references" : (isAgency ? "questions" : "references"));
  const [query, setQuery] = useState(""); // « Rechercher dans la bibliothèque… » : s'applique à la section CCTP affichée
  useEffect(() => { if (isAgency) getOrganization().then(setTeam).catch(() => {}); }, [isAgency, active?.id]);
  const role = team?.role;
  const canPublish = Boolean(team?.canManageLibrary);
  const canPropose = ["admin", "member"].includes(role);
  const canWriteEstimation = !isAgency || (role ? role !== "viewer" : true);
  const cctpSection = ["questions", "clauses", "types"].includes(section);
  return <main className="agency-library layout-settings" data-agency-library data-library-kind={kind === "estimation" ? "estimation" : undefined}>
    <header className="agency-library-head"><h1><BookOpenCheck size={24} style={{ verticalAlign: "-4px" }} /> Bibliothèque {isAgency ? (active?.name || "agence") : "personnelle"}</h1><p>Le référentiel {isAgency ? "de l’agence" : "économique"}, appliqué à tous {isAgency ? "ses projets" : "vos projets"}.</p></header>
    {isAgency && team && !canPublish && cctpSection && <p className="library-note" data-library-readonly title="Un administrateur ou un membre autorisé valide les modifications proposées."><Info size={13} /> {role === "viewer" ? "Lecture seule : votre rôle de lecteur ne permet pas de modifier la bibliothèque." : "Les modifications sont soumises à validation."}</p>}
    <nav className="library-sections library-groups" aria-label="Sections de la bibliothèque">{groups.map(([id, label, sections]) => <div key={id} className="library-group" data-library-group={id}><span className="library-group-title">{label}</span>{sections.map(([key, name]) => <button key={key} type="button" className={section === key ? "active" : ""} data-library-section={key} onClick={() => { setSection(key); setQuery(""); }}>{name}</button>)}</div>)}</nav>
    {cctpSection && <label className="library-search library-global-search"><Search size={15} /><input type="search" data-library-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans la bibliothèque…" aria-label="Rechercher dans la bibliothèque" /></label>}
    {section === "questions" && team && <div className="team-grid team-grid-single"><TeamQuestionnaireEditor canPropose={canPropose} canPublish={canPublish} refreshKey={team} externalQuery={query} /></div>}
    {section === "clauses" && team && <AgencyClauses canPropose={canPropose} canPublish={canPublish} userEmail={user?.email} query={query} insertContext={insertContext} onUseInCctp={onUseInCctp} />}
    {section === "types" && <WorkTemplates externalQuery={query} />}
    {section === "references" && <PriceReferences canWrite={canWriteEstimation} />}
    {section === "pricing" && <PricingRules />}
  </main>;
}

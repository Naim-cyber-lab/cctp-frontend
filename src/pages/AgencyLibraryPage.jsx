import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpenCheck, Check, Info, Search, X } from "lucide-react";
import { TeamQuestionnaireEditor } from "../components/TeamQuestionnaireEditor";
import { DocumentTemplateStudio } from "../components/DocumentTemplateStudio";
import { PriceReferences } from "../components/PriceReferences";
import { DpgfHistory } from "../components/DpgfHistory";
import { DpgfStructure } from "../components/DpgfStructure";
import { WritingBlocksLibrary } from "../components/WritingBlocksLibrary";
import { DpgfGenerationRules } from "../components/DpgfGenerationRules";
import { DpgfConsultationPolicy } from "../components/DpgfConsultationPolicy";
import { PricingRules } from "../components/PricingRules";
import { WorkTemplates } from "../components/WorkTemplates";
import { EconomySheets } from "../components/EconomySheets";
import { PlanningLibrary } from "../components/PlanningLibrary";
import { FeasibilityRulesLibrary } from "../components/FeasibilityRulesLibrary";
import { AgencyClauses } from "../components/AgencyClauses";
import { deleteTeamClause, getOrganization, proposeTeamClause, rejectTeamClause, validateTeamClause } from "../api/client";
import { useWorkspaces } from "../hooks/useWorkspaces";
import "../team.css";

// Bibliothèque agence transverse : 4 catégories (Questionnaires, Ouvrages & rédaction, Économie, Planning) au lieu d'une organisation par module CCTP / DPGF.
// Les clés de section historiques (questions, clauses, types, references, history, pricing) sont conservées pour les liens existants.
const CATEGORIES = [
  ["questionnaires", "Questionnaires", [["questions", "Questions & règles"], ["feasrules", "Règles de faisabilité"]], true],
  ["ouvrages", "Ouvrages & rédaction", [["clauses", "Clauses"], ["types", "Modèles d’ouvrages"], ["templates", "Modèles CCTP"], ["writingblocks", "Blocs de rédaction"]], true],
  ["dpgf", "DPGF", [["structure", "Postes & structure"], ["generation", "Règles de génération"], ["consultationrules", "Règles de consultation"], ["dpgfrules", "Règles de chiffrage"]], false],
  ["economy", "Économie", [["prices", "Références de prix DPGF"], ["references", "Ajouter un prix"], ["history", "Historique des prix"]], false],
  ["planning", "Planning", [["tasks", "Tâches & séquences"]], false],
];
const CATEGORY_OF = Object.fromEntries(CATEGORIES.flatMap(([id, , sections]) => sections.map(([key]) => [key, id])));
const ORIGINS = [["all", "Tout"], ["agency", "Personnalisé par l’agence"], ["standard", "Standard Calepin"]];
const STATUS = { proposed: "À valider", validated: "Validée", rejected: "Refusée" };

/** Bibliothèque agence : le référentiel de l'agence, en deux domaines séparés — CCTP (questions & règles, clauses, modèles d'ouvrages) et DPGF (références de prix, règles de chiffrage).
 *  Par défaut un administrateur l'édite ; un membre le consulte (édition selon le droit « bibliothèque ») ; un lecteur le lit seulement. `kind="estimation"` ouvre directement le domaine Estimation. */
export function AgencyLibraryPage({ user, onOpenSettings, kind = "cctp", insertContext = null, onUseInCctp, initialSection = null, initialFocus = "", onBack = null, backLabel = "Retour aux projets" }) {
  const { isAgency, active } = useWorkspaces();
  const [team, setTeam] = useState(null);
  const categories = CATEGORIES.filter(([, , , agencyOnly]) => isAgency || !agencyOnly); // sans agence : seules l'économie personnelle et le planning existent
  const firstSection = initialSection && CATEGORY_OF[initialSection] && (isAgency || !CATEGORIES.find(([id]) => id === CATEGORY_OF[initialSection])?.[3]) ? initialSection : kind === "estimation" ? "prices" : (isAgency ? "questions" : "prices");
  const [section, setSection] = useState(firstSection);
  const [origin, setOrigin] = useState("all");
  const [focusRule, setFocusRule] = useState(initialFocus || "");
  const [query, setQuery] = useState(""); // « Rechercher dans la bibliothèque… » : s'applique à la section CCTP affichée
  useEffect(() => { if (isAgency) getOrganization().then(setTeam).catch(() => {}); }, [isAgency, active?.id]);
  const role = team?.role;
  const canPublish = Boolean(team?.canManageLibrary);
  const canPropose = ["admin", "member"].includes(role);
  const canWriteEstimation = !isAgency || (role ? role !== "viewer" : true);
  const cctpSection = ["questions", "templates", "clauses", "types"].includes(section);
  const category = CATEGORY_OF[section];
  const currentSections = categories.find(([id]) => id === category)?.[2] || [];
  return <main className="agency-library layout-settings" data-agency-library data-agency-id={active?.id || ""} data-library-kind={kind === "estimation" ? "estimation" : undefined}>
    {onBack && <button type="button" className="secondary library-back" data-library-back onClick={onBack}><ArrowLeft size={15} /> {backLabel}</button>}
    <header className="agency-library-head"><h1><BookOpenCheck size={24} style={{ verticalAlign: "-4px" }} /> Bibliothèque {isAgency ? (active?.name || "agence") : "personnelle"}</h1><p data-library-intro>Retrouvez ici les méthodes et personnalisations utilisées par {isAgency ? "votre agence" : "vous"} dans Calepin : questions, textes, règles, prix et tâches. La plupart des éléments peuvent aussi être personnalisés directement depuis un projet avec le bouton ✏️.</p></header>
    {isAgency && team && !canPublish && cctpSection && <p className="library-note" data-library-readonly title="Un administrateur ou un membre autorisé valide les modifications proposées."><Info size={13} /> {role === "viewer" ? "Lecture seule : votre rôle de lecteur ne permet pas de modifier la bibliothèque." : "Les modifications sont soumises à validation."}</p>}
    <nav className="library-sections library-categories" aria-label="Catégories de la bibliothèque">{categories.map(([id, label, sections]) => <button key={id} type="button" className={category === id ? "active" : ""} data-library-category={id} aria-pressed={category === id} onClick={() => { setSection(sections[0][0]); setQuery(""); }}>{label}</button>)}</nav>
    {currentSections.length > 0 && <nav className="library-sections library-groups" aria-label="Sections">{currentSections.map(([key, name]) => <button key={key} type="button" className={section === key ? "active" : ""} data-library-section={key} onClick={() => { setSection(key); setQuery(""); }}>{name}</button>)}</nav>}
    {(cctpSection || section === "prices" || section === "tasks" || section === "structure" || section === "writingblocks") && <label className="library-search"><Search size={15} /><input type="search" data-library-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer cette catégorie…" aria-label="Filtrer cette catégorie" /></label>}
    {section === "tasks" && <><nav className="library-filters" data-library-origin-filters aria-label="Origine" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>{ORIGINS.map(([id, label]) => <button key={id} type="button" className={origin === id ? "active" : "secondary"} data-library-origin={id} aria-pressed={origin === id} onClick={() => setOrigin(id)}>{label}</button>)}</nav><PlanningLibrary focusKey={focusRule} query={query} origin={origin} /></>}
    {section === "prices" && <EconomySheets onNavigateSection={(key) => { setSection(key); setQuery(""); }} onOpenRule={(ruleKey) => { setFocusRule(ruleKey); setSection("generation"); setQuery(""); }} canWrite={canWriteEstimation} query={query} origin={origin} onOriginChange={setOrigin} onOpenOperations={() => { setSection("history"); setQuery(""); }} />}
    {section === "questions" && team && <div className="team-grid team-grid-single"><TeamQuestionnaireEditor canPropose={canPropose} canPublish={canPublish} refreshKey={team} externalQuery={query} /></div>}
    {section === "templates" && team && <DocumentTemplateStudio canPublish={canPublish} />}
    {section === "clauses" && team && <AgencyClauses canPropose={canPropose} canPublish={canPublish} userEmail={user?.email} query={query} insertContext={insertContext} onUseInCctp={onUseInCctp} />}
    {section === "feasrules" && <FeasibilityRulesLibrary canPublish={!isAgency || canPublish} agencyName={active?.name || ""} />}
    {section === "types" && <WorkTemplates externalQuery={query} />}
    {section === "references" && <PriceReferences canWrite={canWriteEstimation} onOpenObservations={() => { setSection("history"); setQuery(""); }} />}
    {section === "history" && <DpgfHistory canWrite={canWriteEstimation} />}
    {section === "writingblocks" && <WritingBlocksLibrary focusKey={focusRule} query={query} canPublish={!isAgency || canPublish} />}
    {section === "structure" && <DpgfStructure query={query} canEdit={!isAgency || canPublish} />}
    {section === "generation" && <DpgfGenerationRules canPublish={!isAgency || canPublish} focusKey={focusRule} onOpenPrices={(itemKey) => { setSection("prices"); setQuery(itemKey); }} />}
    {section === "consultationrules" && <DpgfConsultationPolicy canPublish={!isAgency || canPublish} />}
    {(section === "dpgfrules" || section === "pricing") && <PricingRules />}
  </main>;
}

import { useState } from "react";
import { OrganizationTasks } from "../components/OrganizationTasks";
import { HelpOnboarding } from "../components/HelpOnboarding";

/** Page complète des tâches : « Mes tâches | Agence » avec filtres (assigné à, projet, type de ressource, échéance, statut). */
export function TasksPage({ user, projects = [], initialScope = "mine", focusTaskId = null }) {
  const [scope, setScope] = useState(initialScope);
  return <main className="tasks-page layout-portfolio" data-tasks-page>
    <div className="tasks-page-help"><HelpOnboarding topic="tasks" /></div>
    <nav className="tasks-page-tabs" aria-label="Tâches">
      <button type="button" className={scope === "mine" ? "active" : ""} data-tasks-scope="mine" onClick={() => setScope("mine")}>Mes tâches</button>
      <button type="button" className={scope === "team" ? "active" : ""} data-tasks-scope="team" onClick={() => setScope("team")}>Équipe</button>
    </nav>
    <OrganizationTasks projects={projects} currentEmail={user?.email || ""} scope={scope} focusTaskId={focusTaskId} />
  </main>;
}

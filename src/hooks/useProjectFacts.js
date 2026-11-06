import { useEffect, useRef, useState } from "react";
import { getDevisSummary, getFeasibilitySummary, listConsultations } from "../api/client";

const cache = new Map();
// l'étude de faisabilité peut changer sans que le projet soit « modifié » : une entrée de plus de 20 s est rechargée
const fresh = (entry) => (entry && Date.now() - entry.at < 20000 ? entry : null); // `${projectId}:${updatedAt}` → { estimate, consultations }

/** Charge, avec trois requêtes en parallèle au plus, l'estimation et les consultations de chaque projet affiché (page Projets). */
export function useProjectFacts(projects, enabled = true) {
  const [facts, setFacts] = useState({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const key = projects.map((project) => `${project.id}:${project.updatedAt}`).join("|");
  useEffect(() => {
    if (!enabled) return undefined;
    const queue = projects.filter((project) => !project.archived);
    const ready = {};
    for (const project of queue) { const hit = fresh(cache.get(`${project.id}:${project.updatedAt}`)); if (hit) ready[project.id] = hit; }
    setFacts((current) => ({ ...current, ...ready }));
    const pending = queue.filter((project) => !fresh(cache.get(`${project.id}:${project.updatedAt}`)));
    let index = 0;
    const worker = async () => {
      while (alive.current && index < pending.length) {
        const project = pending[index++];
        const [estimate, consultations, feasibility] = await Promise.allSettled([getDevisSummary(project.id), listConsultations(project.id), getFeasibilitySummary(project.id)]);
        const value = { estimate: estimate.status === "fulfilled" ? estimate.value : null, consultations: consultations.status === "fulfilled" ? consultations.value : [], feasibility: feasibility.status === "fulfilled" ? feasibility.value : null };
        cache.set(`${project.id}:${project.updatedAt}`, { ...value, at: Date.now() });
        if (alive.current) setFacts((current) => ({ ...current, [project.id]: value }));
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return undefined;
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return facts;
}

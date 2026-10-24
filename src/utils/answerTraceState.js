import { useCallback, useEffect, useState } from "react";
import { getPlatrerieQuestionnaire, getRuleOverrides, streamGenerateChapter } from "../api/client";

const KEY = "calepin.answerTrace";

/** Préférence « surligner les passages issus de mes réponses » : activée par défaut, mémorisée sur ce navigateur. */
export function useTracePreference() {
  const [on, setOn] = useState(() => {
    try { return window.localStorage.getItem(KEY) !== "off"; } catch { return true; }
  });
  const update = useCallback((next) => {
    setOn((current) => {
      const value = typeof next === "function" ? next(current) : next;
      try { window.localStorage.setItem(KEY, value ? "on" : "off"); } catch { /* stockage indisponible */ }
      return value;
    });
  }, []);
  return [on, update];
}

const answered = (answers, labels) =>
  Object.entries(answers || {})
    .filter(([, value]) => value !== "" && value != null)
    .map(([id, value]) => `${id} — ${labels[id] || id} : ${Array.isArray(value) ? value.join(" ; ") : value}`);

/** Source texte envoyée au moteur de rédaction à partir des réponses du questionnaire (même format que « Générer »). */
export function buildQuestionnaireSource(qState, mode, labels, ruleOverrides = {}) {
  return [
    `###MODE ${mode}`,
    ...(Object.keys(ruleOverrides).length ? [`###RULES ${JSON.stringify(ruleOverrides)}`] : []),
    ...answered(qState.project, labels),
    ...(qState.works || []).map((work) =>
      [`###OUVRAGE id=${work.id} family=${work.family} label=${work.answers?.["Q-W01"] || work.label}`, ...answered(work.answers, labels)].join("\n"),
    ),
  ].join("\n");
}

const inFlight = new Map();
const NO_TRACE = [];

/** Lignes tracées d'un chapitre. Celles enregistrées à la rédaction sont reprises telles quelles ; pour un chapitre rédigé avant
 *  la fonction (rien d'enregistré), elles sont reconstituées à l'ouverture à partir des réponses du questionnaire. */
export function useChapterTrace({ projectId, chapterId, questionnaire, mode, hasContent, enabled = true }) {
  const stored = questionnaire?.traces?.[mode];
  const [computed, setComputed] = useState(null);
  const works = questionnaire?.state?.works;
  const key = `${projectId}:${chapterId}:${mode}`;
  useEffect(() => {
    setComputed(null);
    if (!enabled || !hasContent || chapterId !== "06" || (stored && stored.length) || !works?.length) return undefined;
    let cancelled = false;
    const run = inFlight.get(key) || (async () => {
      const [manifest, overrides] = await Promise.all([getPlatrerieQuestionnaire(projectId), getRuleOverrides().catch(() => ({}))]);
      const labels = Object.fromEntries((manifest?.questions || []).map((question) => [question.id, question.label]));
      const source = buildQuestionnaireSource(questionnaire.state, mode, labels, overrides);
      const result = await streamGenerateChapter(projectId, chapterId, "Rédigez le chapitre Plâtrerie à partir des réponses au questionnaire validées par le maître d’œuvre. Ne complétez aucune donnée manquante.", source, () => {});
      return Array.isArray(result?.trace) ? result.trace : [];
    })();
    inFlight.set(key, run);
    run.then((trace) => { if (!cancelled) setComputed(trace); }).catch(() => {}).finally(() => inFlight.delete(key));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, hasContent, Boolean(stored && stored.length), works?.length]);
  return stored && stored.length ? stored : computed || NO_TRACE;
}

import nspell from 'nspell';
import aff from '../../node_modules/dictionary-fr/index.aff?raw';
import dic from '../../node_modules/dictionary-fr/index.dic?raw';

// Building the French index costs ~7s of solid CPU. It runs here so the main thread stays free:
// the editor is usable immediately and spellcheck simply starts answering once this is ready.
const checker = nspell(aff, dic);
['CCTP', 'DCE', 'DTU', 'ERP', 'BA13', 'placo', 'plâtrerie', 'doublage', 'cloisonnement', 'hydrofuge', 'acoustique'].forEach(word => checker.add(word));

function rankedSuggestions(word) {
  const lower = word.toLocaleLowerCase('fr');
  const grammatical = [`${lower}s`, `${lower}e`, `${lower}es`, `${lower}er`, `${lower}é`, `${lower}ée`, lower.endsWith('s') ? lower.slice(0, -1) : '', lower.endsWith('e') ? lower.slice(0, -1) : ''].filter(Boolean);
  const validGrammatical = grammatical.filter(value => checker.correct(value));
  const unique = [...new Set([...validGrammatical, ...checker.suggest(word)])];
  return unique.slice(0, 4).map(value => /^[A-ZÀ-ÖØ-Þ]/.test(word) ? value.charAt(0).toLocaleUpperCase('fr') + value.slice(1) : value);
}

self.addEventListener('message', event => {
  const { id, type, word } = event.data || {};
  if (type === 'correct') self.postMessage({ id, correct: checker.correct(word) });
  else if (type === 'suggest') self.postMessage({ id, suggestions: rankedSuggestions(word) });
  else if (type === 'add') { checker.add(word); self.postMessage({ id, added: true }) }
});

self.postMessage({ ready: true });

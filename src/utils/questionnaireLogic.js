const text = value => Array.isArray(value) ? value.join(' ; ') : String(value ?? '');
const normalized = value => text(value).trim().toLocaleLowerCase('fr');
const contains = (value, needle) => normalized(value).includes(normalized(needle));

export function evaluateQuestionnaireExpression(expression, answers = {}) {
  if (!expression || expression.op === 'true') return true;
  const args = expression.args || [];
  if (expression.op === 'and') return args.every(item => evaluateQuestionnaireExpression(item, answers));
  if (expression.op === 'or') return args.some(item => evaluateQuestionnaireExpression(item, answers));

  const value = answers[expression.q];
  switch (expression.op) {
    case 'eq': return normalized(value) === normalized(expression.value);
    case 'neq': return normalized(value) !== normalized(expression.value);
    case 'contains': return contains(value, expression.value);
    case 'not_contains': return !contains(value, expression.value);
    case 'in': return (expression.values || []).some(item => normalized(item) === normalized(value));
    case 'contains_any': return (expression.values || []).some(item => contains(value, item));
    case 'project_env_aggressive': return ['agress', 'extérieur', 'corrosion'].some(item => contains(answers['Q-P07'], item));
    case 'acoustic_absorption_goal': return ['αw', 'alpha', 'tr', 'aire d'].some(item => contains(answers['Q-ACO02'], item));
    case 'humidity_severe': return /(^|\s)(eb\+|ec)(\s|$)|hr élevée|forte/.test(normalized(answers['Q-HYG01']));
    case 'impact_specific': return ['scolaire', 'publique', 'renforcé', 'spécifique'].some(item => contains(answers['Q-CHO01'], item));
    case 'has_conserved_door': return contains(answers['Q-MEN02'], 'porte conservée');
    case 'metal_frame_or_electrical': return ['ossature', 'métall', 'électri', 'mise à la terre'].some(item => contains(`${text(answers['Q-W06'])} ${text(answers['Q-AUT01'])}`, item));
    case 'global_air_required': return normalized(answers['Q-AIR01']) === 'oui';
    case 'air_required_current_scope': return normalized(answers['Q-AIR01']) === 'oui' || normalized(answers['Q-MEM01']) === 'oui';
    case 'renovation_or_existing': return /rénov|renov|reprise/i.test(text(answers['Q-P01'])) || normalized(answers['Q-X01']) === 'oui';
    case 'not_none_identified': return Boolean(normalized(value)) && !['aucun identifié', 'aucun identifie', 'aucun'].includes(normalized(value));
    default: return true;
  }
}

export function isQuestionVisible(questionId, applicability, answers) {
  const expression = applicability?.rules?.[questionId]?.display?.expr;
  return evaluateQuestionnaireExpression(expression, answers);
}

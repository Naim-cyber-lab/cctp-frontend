import '../formatting-preferences.css';
import { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Check, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { getFormattingPreferences, updateFormattingPreferences } from '../api/client';
import { DEFAULT_HEADING_STYLES, headingAlign } from '../utils/autoFormat';

const LEVELS = [
  { label: 'Titre de niveau 1', example: '2', sample: 'Objet et étendue des prestations' },
  { label: 'Titre de niveau 2', example: '2.1', sample: 'Cloisons de distribution' },
  { label: 'Titre de niveau 3', example: '2.1.1', sample: 'Plaques de plâtre' },
  { label: 'Titre de niveau 4', example: '2.1.1.1', sample: 'Épaisseur et classement' },
];
const ALIGNS = [
  { id: 'left', label: 'À gauche', Icon: AlignLeft },
  { id: 'center', label: 'Centré', Icon: AlignCenter },
  { id: 'right', label: 'À droite', Icon: AlignRight },
];
const MIN = 7;
const MAX = 32;
const clamp = (value) => Math.min(MAX, Math.max(MIN, Math.round(value * 2) / 2));
const SAME = (a, b) => a.length === b.length && a.every((item, index) => item.sizePt === b[index].sizePt && item.bold === b[index].bold && headingAlign(item) === headingAlign(b[index]));

/** Mise en forme automatique des titres numérotés : réglages par niveau et aperçu en direct d'une page type. */
export function FormattingPreferencesPanel({ onClose, onSaved }) {
  const [styles, setStyles] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getFormattingPreferences().then((response) => setStyles(response.headingStyles.map((item) => ({ ...item, align: headingAlign(item) })))).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, []);
  const update = (index, patch) => {
    setStyles((current) => current.map((item, i) => (i === index ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item)));
    setSaved(false);
  };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await updateFormattingPreferences(styles.map((item) => ({ ...item, centered: item.align === 'center' })));
      setStyles(response.headingStyles.map((item) => ({ ...item, align: headingAlign(item) })));
      setSaved(true);
      onSaved?.(response.headingStyles);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    setStyles(DEFAULT_HEADING_STYLES.map((item) => ({ ...item, align: headingAlign(item) })));
    setSaved(false);
  };

  return (
    <>
      <div className="reuse-backdrop" onClick={onClose} />
      <aside className="reuse-panel formatting-prefs-panel" role="dialog" aria-label="Mise en forme automatique">
        <header>
          <div>
            <small>PERSONNALISATION</small>
            <h2>Mise en forme automatique</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </header>
        <p className="formatting-prefs-intro">
          Réglez une bonne fois pour toutes la taille et l’alignement de vos titres numérotés : le bouton « Mise en forme auto » de l’éditeur (et vos exports Word/PDF) reprendront ces réglages, propres à votre compte.
        </p>
        {loading ? (
          <div className="reuse-state">Chargement…</div>
        ) : error && !styles ? (
          <div className="login-error">{error}</div>
        ) : (
          <div className="formatting-prefs-body">
            <section className="formatting-prefs-preview-card" aria-label="Aperçu en direct">
              <div className="formatting-prefs-section-title"><b>Aperçu en direct</b><small>se met à jour à chaque réglage</small></div>
              <div className="formatting-prefs-sheet" data-formatting-preview>
                {LEVELS.map((level, index) => (
                  <div key={level.example} className="formatting-prefs-sample">
                    <div
                      data-preview-level={index + 1}
                      style={{ fontSize: `${styles[index].sizePt * 1.2}px`, fontWeight: styles[index].bold ? 700 : 400, textAlign: headingAlign(styles[index]) }}
                    >
                      {level.example} {level.sample}
                    </div>
                    {index % 2 === 1 && <p>Les ouvrages sont réalisés conformément aux prescriptions du présent lot et aux documents de référence du projet.</p>}
                  </div>
                ))}
              </div>
            </section>

            <section aria-label="Réglages par niveau">
              <div className="formatting-prefs-section-title"><b>Réglages par niveau</b></div>
              <div className="formatting-prefs-list">
                {styles.map((level, index) => (
                  <div className="formatting-prefs-row" key={index}>
                    <div className="formatting-prefs-label"><b>{LEVELS[index].label}</b><small>exemple : « {LEVELS[index].example} »</small></div>
                    <div className="formatting-prefs-size" role="group" aria-label={`Taille du niveau ${index + 1}`}>
                      <button type="button" aria-label="Réduire" onClick={() => update(index, (item) => ({ sizePt: clamp(item.sizePt - 0.5) }))}><Minus size={13} /></button>
                      <input type="number" min={MIN} max={MAX} step={0.5} value={level.sizePt} aria-label={`Taille du niveau ${index + 1} en points`} onChange={(event) => update(index, { sizePt: clamp(Number(event.target.value) || level.sizePt) })} />
                      <button type="button" aria-label="Augmenter" onClick={() => update(index, (item) => ({ sizePt: clamp(item.sizePt + 0.5) }))}><Plus size={13} /></button>
                      <small>pt</small>
                    </div>
                    <div className="formatting-prefs-toggles">
                      <button type="button" className={level.bold ? 'on' : ''} aria-pressed={level.bold} onClick={() => update(index, (item) => ({ bold: !item.bold }))}>Gras</button>
                      {ALIGNS.map(({ id, label, Icon }) => (
                        <button key={id} type="button" className={`align ${headingAlign(level) === id ? 'on' : ''}`} aria-pressed={headingAlign(level) === id} title={label} aria-label={label} data-align={id} onClick={() => update(index, { align: id })}><Icon size={15} /></button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {error && <div className="login-error">{error}</div>}
            <footer className="formatting-prefs-footer">
              <button type="button" className="formatting-prefs-reset" onClick={reset} disabled={SAME(styles, DEFAULT_HEADING_STYLES)}><RotateCcw size={14} /> Valeurs par défaut</button>
              <button className="formatting-prefs-save" disabled={saving} onClick={save}>
                {saved ? <><Check size={15} /> Enregistré</> : saving ? 'Enregistrement…' : 'Enregistrer mes préférences'}
              </button>
            </footer>
          </div>
        )}
      </aside>
    </>
  );
}

import { Clock3, Sparkles, X } from 'lucide-react';

export function AiUnavailableModal({chapter,onClose}){
 return <div className="ai-unavailable-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="ai-unavailable-modal" role="dialog" aria-modal="true" aria-labelledby="unavailable-title"><button className="ai-unavailable-close" onClick={onClose} aria-label="Fermer"><X size={18}/></button><span className="ai-unavailable-icon"><Clock3 size={22}/></span><small>AGENT IA EN PRÉPARATION</small><h2 id="unavailable-title">L’IA {chapter?.title||'de ce chapitre'} arrive bientôt</h2><p>L’agent spécialisé en <strong>{chapter?.specialty||'ce corps d’état'}</strong> n’a pas encore été implémenté.</p><p>Pour le moment, seule l’IA spécialisée en <strong>plâtrerie, cloisons et isolation</strong> est disponible.</p><button className="ai-unavailable-action" onClick={onClose}><Sparkles size={15}/> J’ai compris</button></section></div>
}

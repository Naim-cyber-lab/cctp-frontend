import { ExternalLink, Headphones, HeadphoneOff, Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VoiceBar } from "./VoiceBar";
import { useVoice } from "../hooks/VoiceContext";
import "../voice.css";

/** Petit bandeau flottant tant que l'on est dans un vocal et que la discussion du CCTP n'est pas affichée (autre page, discussion réduite) :
 *  on peut couper son micro ou quitter sans revenir sur le CCTP. */
export function VoiceDock() {
  const voice = useVoice();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!expanded) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setExpanded(false); };
    const escape = (event) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [expanded]);
  useEffect(() => { if (!voice?.connected) setExpanded(false); }, [voice?.connected]);
  if (!voice || !voice.connected || voice.uiCount > 0) return null;
  const speaking = voice.people.filter((item) => item.speaking && !item.local);
  return <div className="voice-dock-wrap" ref={ref}>
    {/* Un clic sur « Vocal » déplie l'appel ici même, sans quitter la page où l'on se trouve */}
    {expanded && <div className="voice-dock-panel" data-voice-dock-panel>
      <VoiceBar projectId={voice.projectId} />
      {voice.projectId === "workspace" ? <button type="button" className="voice-dock-goto" data-voice-dock-goto onClick={() => { setExpanded(false); window.dispatchEvent(new Event("cctp:open-discussion")); }}><ExternalLink size={13} /> Ouvrir la discussion de l'agence</button> : <button type="button" className="voice-dock-goto" data-voice-dock-goto onClick={() => { setExpanded(false); window.dispatchEvent(new CustomEvent("cctp:open-preview", { detail: { id: voice.projectId } })); }}><ExternalLink size={13} /> Aller au CCTP de l'appel</button>}
    </div>}
    <div className="voice-dock" data-voice-dock role="status">
    <button type="button" className="voice-dock-open" data-voice-dock-open aria-expanded={expanded} title="Afficher l'appel" onClick={() => setExpanded((value) => !value)}>
      <span className={`voice-dot ${voice.status}`} />
      <b>Vocal</b>
      <small>{voice.status === "reconnecting" ? "reconnexion…" : speaking.length ? `${speaking[0].name} parle` : `${voice.people.length} connecté${voice.people.length > 1 ? "s" : ""}`}</small>
    </button>
    <button type="button" className={voice.muted ? "off" : ""} data-voice-dock-mute aria-label={voice.muted ? "Réactiver le micro" : "Couper le micro"} onClick={voice.toggleMute}>{voice.muted ? <MicOff size={14} /> : <Mic size={14} />}</button>
    <button type="button" className={voice.deafened ? "off" : ""} aria-label={voice.deafened ? "Réactiver le son" : "Couper le son"} onClick={voice.toggleDeafen}>{voice.deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}</button>
    <button type="button" className="leave" data-voice-dock-leave aria-label="Quitter le vocal" onClick={voice.leave}><PhoneOff size={14} /></button>
    </div>
  </div>;
}

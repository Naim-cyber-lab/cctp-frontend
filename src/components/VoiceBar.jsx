import { Headphones, HeadphoneOff, Maximize2, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff, Settings2, Video, VideoOff, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { colorFor } from "../hooks/useLiveDocumentCollaboration";
import { useVoice, useVoicePresence } from "../hooks/VoiceContext";
import "../voice.css";

const initials = (email = "", name = "") => (email || name).split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
const keyLabel = (code) => ({ Backquote: "²", Space: "Espace", ControlLeft: "Ctrl gauche", ControlRight: "Ctrl droit", ShiftLeft: "Maj gauche", ShiftRight: "Maj droite", AltLeft: "Alt", AltRight: "Alt Gr", CapsLock: "Verr. maj" }[code] || code.replace(/^Key/, "").replace(/^Digit/, ""));

function ParticipantVideo({ person }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    const track = person.videoTrack;
    if (!element || !track) return undefined;
    track.attach(element);
    element.muted = person.local;
    return () => { try { track.detach(element); } catch { /* piste déjà retirée */ } };
  }, [person.videoTrack, person.local]);
  return <figure className="voice-video" data-voice-video={person.identity} data-voice-video-name={person.name} data-voice-video-local={person.local ? "1" : "0"}>
    <video ref={ref} autoPlay playsInline muted={person.local} />
    <figcaption>{person.local ? "Vous" : person.name}</figcaption>
  </figure>;
}

/** Écran partagé par quelqu'un : tuile cliquable (plein écran). Sa propre diffusion n'est jamais réaffichée (effet miroir). */
function ScreenTile({ person }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    const track = person.screenTrack;
    if (!element || !track) return undefined;
    track.attach(element);
    element.muted = true;
    return () => { try { track.detach(element); } catch { /* piste déjà retirée */ } };
  }, [person.screenTrack]);
  return <figure className="voice-screen" data-voice-screen-tile={person.identity} data-voice-screen-name={person.name}>
    <video ref={ref} autoPlay playsInline muted />
    <figcaption>Écran de {person.name}</figcaption>
    <button type="button" data-voice-screen-full title="Plein écran" aria-label="Voir en plein écran" onClick={() => ref.current?.requestFullscreen?.().catch(() => {})}><Maximize2 size={13} /></button>
  </figure>;
}

/** Salon vocal du CCTP, en haut de la discussion : rejoindre, voir qui parle, couper son micro / le son, régler, quitter. */
export function VoiceBar({ projectId }) {
  const voice = useVoice();
  const here = voice?.connected && voice.projectId === projectId;
  const presence = useVoicePresence(projectId, !here);
  const [settings, setSettings] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const panelRef = useRef(null);
  useEffect(() => {
    if (!settings) return undefined;
    voice.refreshDevices();
    const close = (event) => { if (!panelRef.current?.contains(event.target)) { setSettings(false); setCapturing(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!capturing) return undefined;
    const capture = (event) => { event.preventDefault(); event.stopPropagation(); if (event.code !== "Escape") voice.setPttKey(event.code); setCapturing(false); };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!voice || presence.enabled === false) return null;

  if (!here) {
    const people = presence.participants || [];
    const connecting = voice.status === "connecting" && voice.projectId === projectId;
    return <div className="voice-bar idle" data-voice-bar>
      <button type="button" className="voice-join" data-voice-join disabled={connecting || presence.available === false} onClick={() => voice.join(projectId)}
        title={presence.available === false ? "Le serveur vocal est indisponible pour le moment" : "Rejoindre le salon vocal de ce CCTP"}>
        <Headphones size={15} /> {connecting ? "Connexion…" : voice.connected ? "Changer de salon vocal" : "Rejoindre le vocal"}
      </button>
      {people.length > 0 && <span className="voice-present" data-voice-present title={people.map((item) => item.name).join(", ")}>
        <span className="voice-avatars">{people.slice(0, 4).map((item) => <i key={item.userId} style={{ background: colorFor(item.email || item.name) }}>{initials(item.email, item.name)}</i>)}</span>
        {people.length} dans le vocal</span>}
      {voice.error && voice.projectId === projectId && <small className="voice-error" role="alert" data-voice-error>{voice.error}</small>}
      {voice.error && !voice.projectId && <small className="voice-error" role="alert" data-voice-error>{voice.error}</small>}
    </div>;
  }

  const ptt = voice.mode === "ptt";
  const me = voice.people.find((item) => item.local);
  const micOff = voice.muted || !!voice.micIssue || (ptt ? !voice.pttDown : !!me?.muted);
  const MIC_HELP = {
    pending: "Autorisez le micro dans la fenêtre affichée par votre navigateur (en haut à gauche, près de l'adresse).",
    blocked: "Le micro est bloqué pour ce site. Cliquez sur le cadenas à gauche de l'adresse, choisissez Micro → Autoriser, puis « Réessayer ». Si ça ne change rien : Paramètres Windows → Confidentialité → Microphone.",
    none: "Aucun micro détecté. Branchez un micro ou un casque, puis « Réessayer ».",
    busy: "Le micro est utilisé par une autre application (ou a été coupé par le système). Fermez-la, puis « Réessayer ».",
  };
  return <div className="voice-bar live" data-voice-bar data-voice-live>
    <div className="voice-status">
      <span className={`voice-dot ${voice.status}`} data-voice-status={voice.status} />
      <b>{voice.status === "reconnecting" ? "Reconnexion…" : "Dans le vocal"}</b>
      {ptt && <small data-voice-ptt-hint>{voice.pttDown ? "vous parlez" : `maintenez ${keyLabel(voice.pttKey)} pour parler`}</small>}
    </div>
    <ul className="voice-people" data-voice-people>
      {voice.people.map((item) => <li key={item.identity} className={`${item.speaking ? "speaking" : ""} ${item.muted ? "muted" : ""}`} data-voice-person={item.name} data-speaking={item.speaking ? "1" : "0"} data-muted={item.muted ? "1" : "0"} title={`${item.name}${item.local ? " (vous)" : ""}${item.muted ? " · micro coupé" : ""}`}>
        <i style={{ background: colorFor(item.email || item.name) }}>{initials(item.email, item.name)}</i>
        <span>{item.local ? "Vous" : item.name}</span>
        {item.muted && <MicOff size={11} className="voice-muted-mark" />}
      </li>)}
    </ul>
    {voice.people.some((item) => !item.local && item.screen && item.screenTrack) && <div className="voice-screens" data-voice-screens>
      {voice.people.filter((item) => !item.local && item.screen && item.screenTrack).map((item) => <ScreenTile key={item.identity} person={item} />)}
    </div>}
    {me?.screen && <div className="voice-sharing" data-voice-sharing><MonitorUp size={14} /> <span>Vous partagez votre écran</span><button type="button" data-voice-screen-stop onClick={voice.toggleScreen}>Arrêter</button></div>}
    {voice.people.some((item) => item.camera && item.videoTrack) && <div className="voice-videos" data-voice-videos>
      {voice.people.filter((item) => item.camera && item.videoTrack).map((item) => <ParticipantVideo key={item.identity} person={item} />)}
    </div>}
    <div className="voice-controls">
      <button type="button" className={micOff ? "off" : ""} data-voice-mute aria-pressed={micOff}
        title={ptt ? `Mode « appuyer pour parler » : micro fermé tant que vous ne maintenez pas ${keyLabel(voice.pttKey)}. Cliquez pour ouvrir le micro en permanence.` : voice.muted ? "Réactiver le micro" : "Couper le micro"}
        onClick={ptt ? voice.openMic : voice.toggleMute}>
        {micOff ? <MicOff size={15} /> : <Mic size={15} />}</button>
      <button type="button" className={voice.cameraEnabled ? "" : "off"} data-voice-camera aria-pressed={voice.cameraEnabled}
        title={voice.cameraEnabled ? "Couper la caméra" : "Activer la caméra"} onClick={voice.toggleCamera}>
        {voice.cameraEnabled ? <Video size={15} /> : <VideoOff size={15} />}</button>
      <button type="button" className={me?.screen ? "on-air" : ""} data-voice-screen aria-pressed={!!me?.screen} title={me?.screen ? "Arrêter le partage d'écran" : "Partager mon écran"} onClick={voice.toggleScreen}>
        {me?.screen ? <MonitorOff size={15} /> : <MonitorUp size={15} />}</button>
      <button type="button" className={voice.deafened ? "off" : ""} data-voice-deafen aria-pressed={voice.deafened} title={voice.deafened ? "Réactiver le son" : "Couper le son (casque)"} onClick={voice.toggleDeafen}>
        {voice.deafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}</button>
      <button type="button" data-voice-settings aria-expanded={settings} title="Réglages du vocal" onClick={() => setSettings((value) => !value)}><Settings2 size={15} /></button>
      <button type="button" className="leave" data-voice-leave title="Quitter le vocal" onClick={voice.leave}><PhoneOff size={15} /></button>
    </div>
    {ptt && !voice.micIssue && <div className="voice-issue ptt" data-voice-ptt-banner>
      <span>Mode « appuyer pour parler » : votre micro reste <b>fermé</b> tant que vous ne maintenez pas <kbd>{keyLabel(voice.pttKey)}</kbd>.</span>
      <button type="button" data-voice-open-mic onClick={voice.openMic}>Ouvrir le micro</button>
    </div>}
    {voice.micIssue && <div className={`voice-issue ${voice.micIssue}`} data-voice-issue={voice.micIssue} role="alert">
      <span>{MIC_HELP[voice.micIssue]} <b>Vous pouvez écouter les autres en attendant.</b></span>
      {voice.micIssue !== "pending" && <button type="button" data-voice-retry onClick={voice.retryMic}>Réessayer</button>}
    </div>}
    {voice.error && <small className="voice-error" role="alert" data-voice-error>{voice.error}</small>}
    {voice.cameraIssue && <small className="voice-error" role="alert" data-camera-error>{voice.cameraIssue}</small>}
    {voice.screenIssue && <small className="voice-error" role="alert" data-screen-error>{voice.screenIssue}</small>}
    {settings && <div className="voice-settings" ref={panelRef} data-voice-settings-panel>
      <label>Microphone
        <select data-voice-mic value={voice.devices.current || ""} onChange={(event) => voice.chooseMic(event.target.value)}>
          {!voice.devices.inputs.length && <option value="">Micro par défaut</option>}
          {voice.devices.inputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Micro"}</option>)}
        </select></label>
      <div className="voice-mode"><span>Mode</span>
        <button type="button" className={!ptt ? "on" : ""} data-voice-mode="open" onClick={() => voice.setMode("open")}>Micro ouvert</button>
        <button type="button" className={ptt ? "on" : ""} data-voice-mode="ptt" onClick={() => voice.setMode("ptt")}>Appuyer pour parler</button></div>
      {ptt && <div className="voice-key"><span>Touche</span>
        <button type="button" data-voice-key onClick={() => setCapturing(true)}>{capturing ? "Appuyez sur une touche…" : keyLabel(voice.pttKey)}</button></div>}
      {voice.people.filter((item) => !item.local).length > 0 && <div className="voice-volumes"><span>Volume de chacun</span>
        {voice.people.filter((item) => !item.local).map((item) => <label key={item.identity}>{item.name}
          <input type="range" min="0" max="1" step="0.05" value={voice.volumes[item.identity] ?? 1} data-voice-volume={item.name} onChange={(event) => voice.setVolume(item.identity, Number(event.target.value))} /></label>)}</div>}
      <p className="voice-note"><Wifi size={11} /> Réduction de bruit et annulation d'écho activées.</p>
    </div>}
  </div>;
}

import { Room, RoomEvent, Track, AudioPresets } from "livekit-client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getVoiceState, getVoiceToken, livekitUrl } from "../api/client";
import { VoiceDock } from "../components/VoiceDock";

/** Vocal des CCTP (comme un salon vocal Discord) : la connexion vit au niveau de l'application, elle continue quand on change de page.
 *  Le navigateur parle directement au serveur audio (LiveKit) ; cette API ne fait que délivrer l'accès au salon du CCTP. */
const VoiceContext = createContext(null);
export const useVoice = () => useContext(VoiceContext);

const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* préférence non conservée */ } };
const DEFAULT_PTT_KEY = "Backquote";

export function VoiceProvider({ children }) {
  const roomRef = useRef(null), audioRef = useRef(new Map()), listenersRef = useRef(0);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | reconnecting
  const [projectId, setProjectId] = useState(null);
  const [error, setError] = useState("");
  const [people, setPeople] = useState([]);
  const [muted, setMutedState] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraIssue, setCameraIssue] = useState("");
  const [screenIssue, setScreenIssue] = useState("");
  // Pourquoi le micro ne marche pas (la personne entend quand même les autres) : pending = en attente de l'autorisation du navigateur,
  // blocked = refusé (navigateur ou Windows), none = aucun micro détecté, busy = pris par une autre application.
  const [micIssue, setMicIssue] = useState(null);
  const [deafened, setDeafened] = useState(false);
  const [mode, setModeState] = useState(() => read("voice:mode", "open")); // open : micro ouvert | ptt : appuyer pour parler
  const [pttKey, setPttKeyState] = useState(() => read("voice:pttKey", DEFAULT_PTT_KEY));
  const [pttDown, setPttDown] = useState(false);
  const [volumes, setVolumes] = useState(() => read("voice:volumes", {}));
  const [devices, setDevices] = useState({ inputs: [], current: "" });
  const [uiCount, setUiCount] = useState(0); // nombre d'écrans de discussion affichés (le « dock » flottant se cache alors)
  const deafRef = useRef(false), volumesRef = useRef(volumes), mutedRef = useRef(false), modeRef = useRef(mode);
  deafRef.current = deafened; volumesRef.current = volumes; mutedRef.current = muted; modeRef.current = mode;

  const snapshot = useCallback(() => {
    const room = roomRef.current;
    if (!room) { setPeople([]); return; }
    const all = [room.localParticipant, ...room.remoteParticipants.values()];
    setPeople(all.map((participant) => {
      let email = "";
      try { email = JSON.parse(participant.metadata || "{}").email || ""; } catch { /* métadonnées absentes */ }
      return {
        identity: participant.identity, name: participant.name || participant.identity, email, local: participant === room.localParticipant,
        speaking: participant.isSpeaking, muted: !participant.isMicrophoneEnabled, quality: participant.connectionQuality,
        camera: participant.isCameraEnabled,
        videoTrack: participant.getTrackPublication(Track.Source.Camera)?.track || null,
        screen: participant.isScreenShareEnabled,
        screenTrack: participant.getTrackPublication(Track.Source.ScreenShare)?.track || null,
      };
    }));
  }, []);

  const applyVolumes = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach((participant) => participant.setVolume(deafRef.current ? 0 : (volumesRef.current[participant.identity] ?? 1)));
    audioRef.current.forEach((elements) => elements.forEach((element) => { element.muted = deafRef.current; }));
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const inputs = await Room.getLocalDevices("audioinput");
      setDevices({ inputs: inputs.filter((item) => item.deviceId), current: roomRef.current?.getActiveDevice("audioinput") || "" });
    } catch { /* pas d'autorisation : liste vide */ }
  }, []);

  // Aligne le micro réel sur l'état voulu. Un micro peut « mourir » en cours de route (casque Bluetooth, autre application, changement de
  // périphérique) : la piste est alors terminée et un simple « réactiver » ne fait rien. On la recrée dans ce cas.
  const classify = (reason) => {
    const text = `${reason?.name || ""} ${reason?.message || ""}`;
    if (/NotFound|DevicesNotFound|requested device not found|no.*device/i.test(text)) return "none";
    if (/NotReadable|TrackStart|Could not start|AbortError|in use/i.test(text)) return "busy";
    return "blocked"; // NotAllowedError, permission refusée ou ignorée, politique du système
  };
  const micBusy = useRef(Promise.resolve());
  const applyMic = useCallback((enabled) => {
    const run = async () => {
      const room = roomRef.current;
      if (!room) return true;
      const local = room.localParticipant;
      const publication = () => local.getTrackPublication(Track.Source.Microphone);
      const dead = () => publication()?.track?.mediaStreamTrack?.readyState === "ended";
      try {
        if (!enabled) {
          const current = publication();
          if (current?.track && !current.isMuted) await current.mute();
          return true;
        }
        if (dead()) { try { await local.unpublishTrack(publication().track, true); } catch { /* déjà retirée */ } }
        const current = publication();
        if (current?.track && current.isMuted) await current.unmute();
        else if (!current?.track) await local.setMicrophoneEnabled(true);
        // vérification : si le micro n'est toujours pas actif, on recrée entièrement la capture une fois
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (roomRef.current === room && (!local.isMicrophoneEnabled || dead())) {
          try { const old = publication(); if (old?.track) await local.unpublishTrack(old.track, true); } catch { /* rien à retirer */ }
          await local.setMicrophoneEnabled(true);
        }
        if (enabled) setMicIssue(local.isMicrophoneEnabled ? null : "busy");
        return local.isMicrophoneEnabled;
      } catch (reason) {
        if (enabled) setMicIssue(classify(reason));
        return false;
      }
    };
    micBusy.current = micBusy.current.then(run, run); // une opération à la fois, dans l'ordre des clics
    return micBusy.current;
  }, []);

  const teardown = useCallback(() => {
    audioRef.current.forEach((elements) => elements.forEach((element) => element.remove()));
    audioRef.current.clear();
    roomRef.current = null;
    setPeople([]); setStatus("idle"); setProjectId(null); setMutedState(false); setCameraEnabled(false); setCameraIssue(""); setScreenIssue(""); setDeafened(false); setPttDown(false); setMicIssue(null);
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (room) { try { await room.disconnect(true); } catch { /* déjà déconnecté */ } }
    teardown();
  }, [teardown]);

  const join = useCallback(async (id) => {
    if (roomRef.current) { if (projectId === id) return true; await leave(); }
    setError(""); setStatus("connecting"); setProjectId(id);
    try {
      const { token } = await getVoiceToken(id);
      const room = new Room({
        adaptiveStream: false, dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        publishDefaults: { dtx: true, red: true, audioPreset: AudioPresets.speech },
      });
      roomRef.current = room;
      room
        .on(RoomEvent.ParticipantConnected, snapshot).on(RoomEvent.ParticipantDisconnected, snapshot)
        .on(RoomEvent.ActiveSpeakersChanged, snapshot).on(RoomEvent.TrackMuted, snapshot).on(RoomEvent.TrackUnmuted, snapshot)
        .on(RoomEvent.LocalTrackPublished, snapshot).on(RoomEvent.LocalTrackUnpublished, snapshot).on(RoomEvent.TrackPublished, snapshot).on(RoomEvent.TrackUnpublished, snapshot).on(RoomEvent.ConnectionQualityChanged, snapshot)
        .on(RoomEvent.ParticipantMetadataChanged, snapshot).on(RoomEvent.ParticipantNameChanged, snapshot)
        .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
          if (track.kind !== Track.Kind.Audio) { snapshot(); return; }
          const element = track.attach();
          element.muted = deafRef.current; element.style.display = "none"; element.dataset.voiceAudio = participant.identity;
          document.body.appendChild(element);
          audioRef.current.set(track.sid, [element]);
          participant.setVolume(deafRef.current ? 0 : (volumesRef.current[participant.identity] ?? 1));
          snapshot();
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((element) => element.remove()); audioRef.current.delete(track.sid); snapshot(); })
        .on(RoomEvent.Reconnecting, () => setStatus("reconnecting"))
        .on(RoomEvent.Reconnected, () => { setStatus("connected"); snapshot(); })
        .on(RoomEvent.Disconnected, () => { if (roomRef.current === room) teardown(); })
        .on(RoomEvent.MediaDevicesError, (reason) => setError(reason?.message || "Micro inaccessible"))
        .on(RoomEvent.AudioPlaybackStatusChanged, () => { if (!room.canPlaybackAudio) room.startAudio().catch(() => {}); })
        .on(RoomEvent.ActiveDeviceChanged, refreshDevices);
      await room.connect(livekitUrl(), token, { autoSubscribe: true });
      await room.startAudio().catch(() => {});
      setStatus("connected");
      setMicIssue("pending"); // la fenêtre d'autorisation du navigateur peut s'afficher : on le dit tout de suite
      try {
        await room.localParticipant.setMicrophoneEnabled(true); // le micro est capturé une fois pour toutes ; couper / rouvrir ne fait ensuite que (dé)muter la piste
        setMicIssue(null);
        if (modeRef.current === "ptt") await applyMic(false);
      } catch (reason) {
        setMicIssue(classify(reason)); // on reste dans le vocal pour écouter ; « Réessayer » redemande le micro
      }
      snapshot(); refreshDevices();
      return true;
    } catch (reason) {
      const message = reason?.message || "Connexion impossible";
      setError(/503|configuré/.test(message) ? "Le vocal n'est pas disponible sur ce serveur." : `Connexion au vocal impossible : ${message}`);
      try { await roomRef.current?.disconnect(); } catch { /* rien à fermer */ }
      teardown();
      return false;
    }
  }, [applyMic, leave, projectId, refreshDevices, snapshot, teardown]);

  const setMuted = useCallback(async (value) => {
    if (!roomRef.current) return;
    mutedRef.current = value; // pris en compte immédiatement : des clics rapprochés restent cohérents
    setMutedState(value);
    const ok = await applyMic(!value && modeRef.current !== "ptt");
    if (!ok && !value) { mutedRef.current = true; setMutedState(true); } // impossible de rouvrir le micro : on le dit, l'état reste « coupé »
    snapshot();
  }, [applyMic, snapshot]);
  // Le micro n'a jamais pu être ouvert : « réactiver » ne bascule pas un état, il refait la demande (autorisation, périphérique…).
  const retryMic = useCallback(async () => {
    if (!roomRef.current) return;
    setMicIssue("pending");
    mutedRef.current = false; setMutedState(false);
    const ok = await applyMic(modeRef.current !== "ptt");
    if (ok || modeRef.current === "ptt") setMicIssue(null);
    snapshot();
  }, [applyMic, snapshot]);
  const toggleMute = useCallback(() => { if (micIssue && micIssue !== "pending") retryMic(); else setMuted(!mutedRef.current); }, [micIssue, retryMic, setMuted]);
  const toggleDeafen = useCallback(() => { setDeafened((value) => { deafRef.current = !value; applyVolumes(); return !value; }); }, [applyVolumes]);
  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isCameraEnabled;
    setCameraIssue("");
    try {
      await room.localParticipant.setCameraEnabled(enabled);
      setCameraEnabled(room.localParticipant.isCameraEnabled);
      snapshot();
    } catch (reason) {
      setCameraEnabled(false);
      setCameraIssue(reason?.name === "NotAllowedError" ? "Autorisez la caméra pour ce site, puis réessayez." : (reason?.message || "Caméra inaccessible."));
      snapshot();
    }
  }, [snapshot]);
  // Partage d'écran : le navigateur propose lui-même de choisir l'écran, une fenêtre ou un onglet ; « Arrêter le partage » (barre du navigateur) est pris en compte.
  const toggleScreen = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isScreenShareEnabled;
    setScreenIssue("");
    try {
      await room.localParticipant.setScreenShareEnabled(enabled, enabled ? { audio: false, resolution: { width: 1920, height: 1080, frameRate: 15 }, contentHint: "detail" } : undefined);
    } catch (reason) {
      // refuser la fenêtre de choix n'est pas une erreur à afficher
      if (!(reason?.name === "NotAllowedError" || /permission|cancel|denied/i.test(reason?.message || ""))) setScreenIssue(reason?.message || "Le partage d'écran n'a pas pu démarrer.");
    }
    snapshot();
  }, [snapshot]);
  const setVolume = useCallback((identity, value) => {
    setVolumes((current) => { const next = { ...current, [identity]: value }; write("voice:volumes", next); volumesRef.current = next; return next; });
    roomRef.current?.remoteParticipants.get(identity)?.setVolume(deafRef.current ? 0 : value);
  }, []);
  const setMode = useCallback(async (value) => {
    setModeState(value); write("voice:mode", value); modeRef.current = value;
    if (roomRef.current) { await applyMic(value !== "ptt" && !mutedRef.current); snapshot(); }
  }, [applyMic, snapshot]);
  // Quitter le mode « appuyer pour parler » : micro ouvert en permanence (et plus coupé)
  const openMic = useCallback(async () => {
    mutedRef.current = false; setMutedState(false);
    await setMode("open");
  }, [setMode]);
  const setPttKey = useCallback((code) => { setPttKeyState(code); write("voice:pttKey", code); }, []);
  const chooseMic = useCallback(async (deviceId) => { try { await roomRef.current?.switchActiveDevice("audioinput", deviceId); setDevices((current) => ({ ...current, current: deviceId })); } catch (reason) { setError(reason?.message || "Micro inaccessible"); } }, []);

  // appuyer pour parler : le micro n'est ouvert que tant que la touche est maintenue
  useEffect(() => {
    if (status === "idle" || mode !== "ptt") return undefined;
    const typing = (event) => event.target?.closest?.("input, textarea, [contenteditable='true']") && event.key?.length === 1;
    const down = (event) => { if (event.code !== pttKey || event.repeat || typing(event) || mutedRef.current) return; setPttDown(true); applyMic(true).then(snapshot); };
    const up = (event) => { if (event.code !== pttKey) return; setPttDown(false); applyMic(false).then(snapshot); };
    const blur = () => { setPttDown(false); applyMic(false).then(snapshot); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [status, mode, pttKey, snapshot, applyMic]);

  // on quitte proprement en fermant l'onglet
  useEffect(() => {
    const bye = () => { roomRef.current?.disconnect(true); };
    window.addEventListener("pagehide", bye);
    return () => { window.removeEventListener("pagehide", bye); roomRef.current?.disconnect(true); };
  }, []);

  const attachUI = useCallback((id) => { listenersRef.current += 1; setUiCount((count) => count + 1); return () => { listenersRef.current -= 1; setUiCount((count) => Math.max(0, count - 1)); }; }, []);
  const value = useMemo(() => ({
    status, projectId, error, people, muted, micIssue, retryMic, openMic, cameraEnabled, cameraIssue, screenIssue, toggleScreen, deafened, mode, pttKey, pttDown, volumes, devices, connected: status === "connected" || status === "reconnecting",
    join, leave, toggleMute, toggleCamera, toggleDeafen, setVolume, setMode, setPttKey, chooseMic, refreshDevices, attachUI, clearError: () => setError(""), uiCount,
  }), [status, projectId, error, people, muted, micIssue, retryMic, openMic, cameraEnabled, cameraIssue, screenIssue, toggleScreen, deafened, mode, pttKey, pttDown, volumes, devices, join, leave, toggleMute, toggleCamera, toggleDeafen, setVolume, setMode, setPttKey, chooseMic, refreshDevices, attachUI, uiCount]);

  return <VoiceContext.Provider value={value}>{children}<VoiceDock /></VoiceContext.Provider>;
}

/** Qui est dans le vocal d'un CCTP quand on n'y est pas (réponse du serveur, rafraîchie toutes les 8 s tant que le composant est affiché). */
export function useVoicePresence(projectId, active = true) {
  const [state, setState] = useState({ enabled: true, available: true, participants: [] });
  useEffect(() => {
    if (!active || !projectId) return undefined;
    let stopped = false;
    const load = () => getVoiceState(projectId).then((data) => { if (!stopped) setState(data); }).catch(() => {});
    load();
    const timer = setInterval(load, 8000);
    return () => { stopped = true; clearInterval(timer); };
  }, [projectId, active]);
  return state;
}


import { useEffect, useState } from "react";
import { heartbeatCctp } from "../api/client";

export function useCctpPresence(projectId, location, editing) {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    if (!projectId) { setMembers([]); return; }
    let alive = true;
    const beat = async () => {
      try { const rows = await heartbeatCctp(projectId, location, editing); if (alive) setMembers(rows); }
      catch { /* la présence ne doit jamais bloquer l'édition */ }
    };
    beat(); const timer = setInterval(beat, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [projectId, location, editing]);
  return members;
}

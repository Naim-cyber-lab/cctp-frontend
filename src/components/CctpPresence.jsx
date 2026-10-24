import { Eye, Pencil, Users } from "lucide-react";

export function CctpPresence({ members = [], currentEmail = "", lifted = false }) {
  const others = members.filter((member) => member.email !== currentEmail);
  if (!others.length) return null;
  return <aside className={`cctp-presence ${lifted ? "is-lifted" : ""}`} aria-live="polite"><Users size={16}/><div><b>{others.length} collaborateur{others.length > 1 ? "s" : ""} présent{others.length > 1 ? "s" : ""}</b>{others.map((member)=><span key={member.userId}>{member.editing ? <Pencil size={11}/> : <Eye size={11}/>} {member.email.split("@")[0]} · {member.location}</span>)}</div></aside>;
}

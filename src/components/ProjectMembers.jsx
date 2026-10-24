import { Crown, Eye, Pencil, Users } from "lucide-react";

const LABEL = { owner: "Créateur", write: "Écriture", read: "Lecture seule" };
const ICON = { owner: Crown, write: Pencil, read: Eye };
const SHOWN = 4;

/** Carte de la liste « Vos CCTP » : qui a accès au CCTP et avec quel droit (le créateur gère les droits via « Partager »). */
export function ProjectMembers({ project }) {
  const members = project.members?.length ? project.members : [{ email: project.ownerEmail, role: "owner" }];
  const mine = LABEL[project.accessRole] || "Lecture seule";
  return <div className="project-members" data-project-members>
    <b><Users size={12}/> {project.external ? `Invité externe · ${mine}` : `Invités externes · ${Math.max(0, members.length - 1)}`}</b>
    {members.slice(0, SHOWN).map((member) => {
      const Icon = ICON[member.role] || Eye;
      return <span key={member.email} data-member-email={member.email} data-member-role={member.role} title={`${member.email} · ${LABEL[member.role] || "Lecture seule"}`}>
        <i>{member.email}</i>
        <em className={`role-${member.role}`}><Icon size={9}/> {LABEL[member.role] || "Lecture seule"}</em>
      </span>;
    })}
    {members.length > SHOWN && <small>+ {members.length - SHOWN} autre{members.length - SHOWN > 1 ? "s" : ""}</small>}
  </div>;
}

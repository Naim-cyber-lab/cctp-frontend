import { Blocks, Check, DoorOpen, FileText, Grid3X3, HardHat, PaintRoller, PanelTop, PanelsTopLeft, Pipette, Shovel, Warehouse, Wind, Zap } from 'lucide-react';

const icons = { Blocks, DoorOpen, FileText, Grid3X3, HardHat, PaintRoller, PanelTop, PanelsTopLeft, Pipette, Shovel, Warehouse, Wind, Zap };

export function ChapterCard({chapter, selected, onToggle}){
  const Icon = icons[chapter.icon] || FileText;
  return <button className={`chapter-card ${selected?'selected':''}`} onClick={()=>onToggle(chapter.id)} aria-pressed={selected}>
    <span className="check">{selected ? <Check size={14}/> : null}</span>
    <span className="chapter-icon"><Icon size={22} strokeWidth={1.7}/></span>
    <span className="chapter-code">{chapter.code}</span>
    <strong>{chapter.title}</strong>
    <small>{chapter.description}</small>
  </button>
}

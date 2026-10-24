import { ImagePlus, X } from 'lucide-react';

export function ImageInsertDialog({image,onCancel,onConfirm}){
 const updateSize=value=>image.setSize(Number(value));
 return <div className="image-insert-backdrop" role="presentation"><section className="image-insert-dialog" role="dialog" aria-modal="true" aria-label="Préparer l’image"><header><div><ImagePlus size={19}/><span><b>Préparer l’image</b><small>Réglez sa taille avant de la placer dans le CCTP.</small></span></div><button onClick={onCancel} title="Fermer"><X size={18}/></button></header><div className="image-insert-preview"><img src={image.src} alt={image.name} style={{width:`${image.size}%`}}/></div><label className="image-insert-size"><span>Taille de l’image</span><input type="range" min="10" max="100" step="5" value={image.size} onChange={event=>updateSize(event.target.value)}/><strong>{image.size}%</strong></label><footer><button className="secondary" onClick={onCancel}>Annuler</button><button className="primary" onClick={()=>onConfirm(image)}><ImagePlus size={15}/> Placer l’image</button></footer></section></div>
}

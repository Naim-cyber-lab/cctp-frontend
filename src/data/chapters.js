export const categories = ['Tous', 'Gros œuvre', 'Second œuvre', 'Techniques', 'Finitions', 'Extérieurs'];

export const chapters = [
  { id:'01', code:'LOT 01', title:'Installation de chantier', specialty:'installation et organisation de chantier', category:'Gros œuvre', description:'Organisation, protections et moyens communs.', icon:'HardHat' },
  { id:'02', code:'LOT 02', title:'Terrassements', specialty:'terrassements et travaux de plateforme', category:'Gros œuvre', description:'Fouilles, remblais, évacuation et plateformes.', icon:'Shovel' },
  { id:'03', code:'LOT 03', title:'Gros œuvre', specialty:'gros œuvre, structures béton et maçonnerie', category:'Gros œuvre', description:'Fondations, structures béton et maçonneries.', icon:'Blocks' },
  { id:'04', code:'LOT 04', title:'Charpente – Couverture', specialty:'charpente, couverture et étanchéité', category:'Extérieurs', description:'Charpente, étanchéité et évacuation des eaux.', icon:'Warehouse' },
  { id:'05', code:'LOT 05', title:'Menuiseries extérieures', specialty:'menuiseries extérieures, vitrages et occultations', category:'Second œuvre', description:'Baies, vitrages, occultations et performances.', icon:'PanelTop' },
  { id:'06', code:'LOT 06', title:'Plâtrerie – Isolation', specialty:'plâtrerie, cloisons et isolation', category:'Second œuvre', description:'Cloisons, doublages, plafonds et isolation.', icon:'PanelsTopLeft' },
  { id:'07', code:'LOT 07', title:'Menuiseries intérieures', specialty:'menuiseries intérieures et agencement', category:'Second œuvre', description:'Blocs-portes, agencements et quincaillerie.', icon:'DoorOpen' },
  { id:'08', code:'LOT 08', title:'Électricité', specialty:'électricité, courants forts et courants faibles', category:'Techniques', description:'Courants forts, faibles, éclairage et sécurité.', icon:'Zap' },
  { id:'09', code:'LOT 09', title:'Plomberie – Sanitaires', specialty:'plomberie, équipements sanitaires et évacuations', category:'Techniques', description:'Réseaux, appareils sanitaires et évacuations.', icon:'Pipette' },
  { id:'10', code:'LOT 10', title:'CVC – Ventilation', specialty:'chauffage, ventilation et traitement d’air', category:'Techniques', description:'Chauffage, rafraîchissement et traitement d’air.', icon:'Wind' },
  { id:'11', code:'LOT 11', title:'Revêtements de sols', specialty:'revêtements de sols, carrelages et sols souples', category:'Finitions', description:'Sols souples, carrelages et plinthes.', icon:'Grid3X3' },
  { id:'12', code:'LOT 12', title:'Peinture – Finitions', specialty:'peinture, préparations et finitions', category:'Finitions', description:'Préparations, peintures et revêtements muraux.', icon:'PaintRoller' },
];

export const prompts = {
  '06': 'Décrivez les types de cloisons, doublages et plafonds, les performances feu/acoustiques, les locaux concernés et les finitions attendues.',
  '08': 'Précisez les usages, niveaux d’éclairement, équipements, courants faibles, contraintes de sécurité et interfaces avec les autres lots.',
  default: 'Décrivez les ouvrages attendus, leurs localisations, performances, matériaux, contraintes de mise en œuvre et interfaces avec les autres lots.'
};

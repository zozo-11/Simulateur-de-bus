# Simulateur de bus urbain

Application web immersive simulant la conduite d'un bus urbain avec des commandes tactiles/desktop optimisées, une transmission dynamique, des sons temps réel et une vue conducteur animée.

## Lancement

Ouvrir `index.html` dans un navigateur moderne (Chrome, Edge, Firefox, Safari). Aucune dépendance externe n'est nécessaire.

## Commandes

- **Volant** (gauche) : rotation réaliste ±450° par défaut (sélecteur 900→1440°), retour au centre progressif selon la vitesse.
- **Frein** (slider vertical gauche) : ressort de rappel automatique, pré-course 1‑5 % dédiée au ralentisseur, frein de service >5 %, freinage d'urgence >90 %.
- **Accélérateur** (slider vertical droit) : ressort de rappel automatique, détente kickdown vers 85‑88 % avec rétrogradages appuyés.
- **Raccourci caméra** : bouton “Vue conducteur / Vue extérieure” ou touche `V`.

## Points clés

- Transmission automatique à rapports virtuels avec logique de kickdown et zones de régime 15 000‑25 000 tr/min.
- Physique continue sensible à l'intensité des actions (accélérateur, frein, direction) avec gestion des jerks.
- Vue conducteur 1ʳᵉ personne avec inertie de tête, roulis/tangage, vibrations et HUD complet (vitesse, régime, rapports, témoin ((K)) actif >15 km/h lorsque le ralentisseur agit, STOP, R, barres d'intensité).
- Audio temps réel : moteur, ralentisseur (coupé ≤15 km/h), frein de service, crissement pneus, résonance et transitions kickdown.
- Optimisation mobile : cibles tactiles ≥ 44 px, pointer events, scaling dynamique, prévention du scroll pendant les gestes.

## Accessibilité

- Commandes exposées en éléments `role="slider"` avec navigation clavier.
- Lecture vocale des indicateurs HUD et retours visuels/haptiques (si supportés).

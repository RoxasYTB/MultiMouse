# Buenox

Application légère et open‑source pour utiliser plusieurs souris physiques en simultané, chacune avec son propre curseur.

## Concept

Quand plusieurs souris sont physiquement connectées, Buenox crée un curseur indépendant par device. Idéal pour les sessions partagées (Parsec, TeamViewer, etc.) : chaque participant garde sa propre souris au lieu de se partager un seul pointeur. Comparable à MouseMux ou PluralInput, mais gratuit et open source.

Les curseurs personnalisés sont pris en charge : si vous utilisez des curseurs custom, ils s'appliquent aussi aux curseurs dupliqués.

## Points clés

- Détection multi‑souris physiques
- Curseurs indépendants par périphérique
- Attention du détail :


  - Chaque curseur peut être dans plusieurs états (<img width="12" height="21" alt="arrow" src="https://github.com/user-attachments/assets/7afdddfc-934c-417f-b2e1-ccab4b05452e" />, <img width="17" height="22" alt="hand" src="https://github.com/user-attachments/assets/d2789995-3cb7-426b-83be-67d852277914" />, <img width="9" height="18" alt="text_1" src="https://github.com/user-attachments/assets/b3b63097-7fbc-4470-a546-89d5ecfb26ac" /> , etc.) en fonction du contexte (lien, input texte, etc.)
  - Chaque curseur à son état indépendant : l'un peut-être en mode "<img width="17" height="22" alt="hand" src="https://github.com/user-attachments/assets/d2789995-3cb7-426b-83be-67d852277914" />" sur un lien par exemple tandis qu'un autre est en mode "<img width="12" height="21" alt="arrow" src="https://github.com/user-attachments/assets/7afdddfc-934c-417f-b2e1-ccab4b05452e" />", quand il n'y a rien, ou <img width="9" height="18" alt="text_1" src="https://github.com/user-attachments/assets/b3b63097-7fbc-4470-a546-89d5ecfb26ac" /> (si un champ de texte est en dessous du curseur).
  - Prend en charge les curseurs personnalisés (custom cursors)
  <img width="286" height="154" alt="image" src="https://github.com/user-attachments/assets/cb1cf40a-f2fc-4ccc-aea6-8603f1a63ad9" />

  <img width="645" height="574" alt="image" src="https://github.com/user-attachments/assets/8ae3b5f8-b9b4-459d-b3e5-e562a3be84b9" />
  <img width="265" height="156" alt="image" src="https://github.com/user-attachments/assets/73753c40-ee06-4f4b-a2d2-ac9eb49b550d" />


- Gratuit, open source, ouvert à la contribution

## Prérequis

- Windows 10/11 (64‑bit)
- Node.js 18+

## Installation rapide

Ouvrez un terminal (cmd.exe) dans le dossier du projet puis :

```bat
npm install
npm run build
```

Pour générer un exécutable :

```bat
npm run dist
```

Pour lancer la version de développement :

```bat
npm run start
```

## Licence

Usage non commercial uniquement.

# Buenox

Application légère et open‑source pour utiliser plusieurs souris physiques en simultané, chacune avec son propre curseur.

## Concept

Quand plusieurs souris sont physiquement connectées, Buenox crée un curseur indépendant par device. Idéal pour les sessions partagées (Parsec, TeamViewer, etc.) : chaque participant garde sa propre souris au lieu de se partager un seul pointeur. Comparable à MouseMux ou PluralInput, mais gratuit et open source.

Les curseurs personnalisés sont pris en charge : si vous utilisez des curseurs custom, ils s'appliquent aussi aux curseurs dupliqués.

## Points clés

- Détection multi‑souris physiques
- Curseurs indépendants par périphérique
- Attention du détail :
  - Chaque curseur peut être dans plusieurs états (la flèche, main, texte, etc.) en fonction du contexte (lien, input texte, etc.)
  - Chaque curseur à son état indépendant : l'un peut-être en mode "main" sur un lien par exemple tandis qu'un autre est en mode "souris basique", quand il n'y a rien, ou texte (si un champ de texte est en dessous du curseur).
  <img width="286" height="154" alt="image" src="https://github.com/user-attachments/assets/cb1cf40a-f2fc-4ccc-aea6-8603f1a63ad9" />
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

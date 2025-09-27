# Orionix - Multi-Cursor System

Application légère et open‑source pour utiliser plusieurs souris physiques en simultané, chacune avec son propre curseur.

## 🎯 Concept

Quand plusieurs souris sont physiquement connectées, Orionix crée un curseur indépendant par device. Idéal pour les sessions partagées (Parsec, TeamViewer, etc.) : chaque participant garde sa propre souris au lieu de se partager un seul pointeur.

## 🚀 Fonctionnalités

### Interface de Curseurs

- **Curseurs multiples** : Détection et affichage de plusieurs dispositifs de pointage
- **Overlay transparent** : Interface non-intrusive avec transparence complète
- **Détection de type de curseur** : Adaptation automatique selon le contexte (flèche, texte, main, etc.)
- **Curseurs personnalisés** : Support complet des curseurs custom

### Interface de Paramètres

- **Fenêtre de configuration** : Interface moderne avec onglets
- **Paramètres en temps réel** : Application instantanée des modifications
- **Identification** : Couleurs personnalisées, taille, opacité, labels
- **Fonctionnel** : Vitesse, accélération, sensibilité
- **Avancé** : Mode debug, mode sombre, informations techniques

### Contrôles

- **Tray System** : Accès rapide via la zone de notification
- **Raccourcis clavier** :
  - `Ctrl+Shift+S` : Ouvrir les paramètres
  - `Ctrl+Shift+D` : Basculer le mode debug
- **Double-clic tray** : Ouverture directe des paramètres

## 🛠️ Installation

### Prérequis

- Windows 10/11 (64‑bit)
- Node.js 18+

### Installation rapide

```bat
npm install
npm run build
```

### Génération d'exécutable

```bat
npm run dist
```

### Lancement en développement

```bat
npm start
```

## 📁 Architecture Technique

### Communication IPC

- **Main Process** ↔ **Settings Window** : Configuration en temps réel
- **Main Process** ↔ **Overlay Window** : Données des curseurs
- **Settings** → **Main** → **Overlay** : Propagation des paramètres

### Modules Natifs

- **Raw Input Detection** : Capture des mouvements souris bas niveau
- **System Cursor Control** : Masquage/affichage curseur système
- **Cursor Type Detection** : Détection automatique du type de curseur

### Performance

- **High-precision loop** : Rendu 1000 FPS pour fluidité maximale
- **Coordinate mapping** : Calibration précise des coordonnées
- **Event throttling** : Optimisation des performances

## 🤝 Contribution

1. Fork le repository
2. Créer une branche feature (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Commit les changements (`git commit -am 'Ajout nouvelle fonctionnalité'`)
4. Push vers la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Créer une Pull Request

## 📄 Licence

Usage non commercial uniquement.

## 👥 Support

- **Issues** : [GitHub Issues](https://github.com/RoxasYTB/Orionix/issues)
- **Discussions** : [GitHub Discussions](https://github.com/RoxasYTB/Orionix/discussions)

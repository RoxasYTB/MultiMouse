# 🎯 MultimouseElectron

Application **Electron.js** permettant d’utiliser plusieurs souris simultanément avec des curseurs indépendants, grâce à l’API **Raw Input** de Windows.

## ✨ Fonctionnalités principales

- 🖱️ Gestion de plusieurs curseurs en temps réel
- 🎨 Curseurs personnalisés avec détection du type
- 👁️ Overlay transparent par-dessus toutes les apps
- 💾 Configuration sauvegardée automatiquement
- 🚀 Rendu optimisé et haute performance

## 📋 Prérequis

- Windows 10/11 (64-bit)
- Node.js 18+
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/fr/downloads/#build-tools-for-visual-studio-2022) (C++ & SDK Windows installés)

## 🚀 Installation & Build

```bash
# Cloner le repo
git clone https://github.com/RoxasYTB/MultiMouseElectron.git
cd MultiMouseElectron

# Installer les dépendances
npm install

# Compiler le module natif
npm run build
npx electron-rebuild

# Lancer l'application
npm start
```

## ⚙️ Configuration

Un fichier `config.json` est généré au premier lancement :

```json
{
  "sensitivity": 1.5,
  "refreshRate": 1,
  "maxCursors": 4,
  "cursorSize": 20,
  "cursorColors": ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"]
}
```

## 📝 Licence

Projet sous licence **MIT**.

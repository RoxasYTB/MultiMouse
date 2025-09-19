# MultimouseElectron

Application Electron.js pour détecter et utiliser plusieurs souris simultanément avec des curseurs indépendants via l'API Raw Input de Windows.

## Fonctionnalités

- ✅ Détection de plusieurs souris physiques en temps réel
- ✅ Curseur indépendant par device (un curseur par souris)
- ✅ API Raw Input Windows native (C++)
- ✅ Interface overlay transparente
- ✅ Raccourcis clavier F1-F4 pour le contrôle
- ✅ Diagnostics PowerShell intégrés

## Prérequis

- **Windows 10/11 (64-bit)**
- **Node.js 18+**
- **Visual Studio Build Tools 2022** avec :
  - Développement pour applications C++
  - SDK Windows 10/11
  - MSVC v143 - Outils de build C++ VS 2022

## Installation

```bash
git clone https://github.com/RoxasYTB/MultiMouseElectron.git
cd MultiMouseElectron
npm install
```

### Compilation du module C++

Le projet utilise un module C++ natif pour l'API Raw Input. **Problème courant identifié** :

> ⚠️ **Erreur NODE_MODULE_VERSION** : Le module C++ a été compilé pour Node.js version 115, mais Electron utilise la version 116

**Solution** :

```bash
# Recompiler le module pour la version Electron correcte
npx electron-rebuild

# Puis compiler TypeScript
npm run build

# Lancer l'application
npm start
```

Si l'erreur persiste :

```bash
# Nettoyer complètement et recompiler
npm run clean
npm install
npx electron-rebuild
npm run build
```

## Utilisation

### Raccourcis clavier

- **F1** : Démarrer la détection Raw Input
- **F2** : Arrêter la détection Raw Input
- **F3** : Forcer le rechargement Raw Input
- **F4** : Diagnostics complets (PowerShell + Raw Input)

### Test multi-souris

1. Connectez plusieurs souris USB ou Bluetooth
2. Lancez l'application (`npm start`)
3. Appuyez sur **F1** pour démarrer la détection
4. Bougez chaque souris → un curseur indépendant apparaît pour chaque device

### Sortie console exemple

```
NOUVEAU DEVICE AJOUTE: Generic Mouse - Handle: 39259667
Nouveau curseur créé pour device: device_39259667 Generic Mouse

NOUVEAU DEVICE AJOUTE: Generic Mouse - Handle: 4263907
Nouveau curseur créé pour device: device_4263907 Generic Mouse
```

## Architecture

```
src/
├── main.ts                 # Processus principal Electron
├── renderer.ts             # Interface overlay
├── raw_input_detector.ts   # Wrapper API Raw Input
├── multimouse_addon.cpp    # Module C++ natif
└── types.ts               # Interfaces TypeScript
```

## Dépendances principales

- **Electron 26.0.0** : Framework application
- **TypeScript** : Langage principal
- **node-gyp** : Compilation module C++
- **Raw Input API** : Détection souris Windows native

## Développement

```bash
# Mode développement avec rechargement
npm run dev

# Compiler TypeScript uniquement
npm run build

# Nettoyer les builds
npm run clean

# Recompiler module C++ pour Electron
npx electron-rebuild
```

## Troubleshooting

### Module C++ ne se charge pas

```bash
# Vérifier la version Node.js d'Electron
npx electron -v

# Recompiler pour la bonne version
npx electron-rebuild --version=26.0.0
```

### Aucune souris détectée

- Vérifiez que vous êtes sur Windows 10/11
- Testez avec F4 (diagnostics) pour voir les devices disponibles
- Essayez différentes souris USB/Bluetooth

### Erreurs de compilation

- Installez Visual Studio Build Tools 2022
- Vérifiez que le SDK Windows est installé
- Redémarrez après installation des outils

## Licence

MIT - Voir LICENSE pour détails

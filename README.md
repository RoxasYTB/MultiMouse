# Buenox

Application Electron.js pour détecter et utiliser plusieurs souris simultanément avec des curseurs indépendants via l'API Raw Input de Windows.

## Fonctionnalités

- ✅ Détection de plusieurs souris physiques en temps réel
- ✅ Curseur indépendant par device (un curseur par souris)
- ✅ API Raw Input Windows native (C++)
- ✅ Interface overlay transparente
- ✅ Diagnostics PowerShell intégrés

## Prérequis

- **Windows 10/11 (64-bit)**
- **Node.js 18+**
- **Visual Studio Build Tools 2022** avec :
  - Développement pour applications C++
  - SDK Windows 10/11
  - MSVC v143 - Outils de build C++ VS 2022

## Installation

### Prérequis système

Avant de commencer, assurez-vous d'avoir installé les éléments suivants :

- **Windows 10/11 (64-bit)**
- **Node.js 18+** : Téléchargeable sur [nodejs.org](https://nodejs.org/)
- **Visual Studio Build Tools 2022** avec les composants suivants :
  - Développement pour applications C++
  - SDK Windows 10/11
  - MSVC v143 - Outils de build C++ VS 2022
- **Git** : Pour cloner le dépôt

### Étapes d'installation

1. Clonez le dépôt :

   ```bash
   git clone https://github.com/RoxasYTB/Buenox.git
   cd Buenox
   ```

2. Installez les dépendances Node.js :

   ```bash
   npm install
   ```

   Cette commande installera automatiquement les dépendances et recompilera le module natif via le script `postinstall`.

3. (Optionnel) Installez UPX pour une compression optimale :

   ```bash
   # Exécutez le script d'installation
   install-upx.cmd

   # Ou manuellement via Chocolatey
   choco install upx -y

   # Ou via Scoop
   scoop install upx
   ```

## Compilation et Build

### Compilation du module C++ natif

Le projet utilise un module C++ natif pour accéder à l'API Raw Input de Windows. Ce module doit être compilé pour être compatible avec la version d'Electron utilisée.

- **Recompiler le module natif** :

  ```bash
  npm run rebuild
  ```

  Ou utiliser `electron-rebuild` directement :

  ```bash
  npx electron-rebuild
  ```

- **Compiler uniquement TypeScript** :
  ```bash
  npm run compile
  ```

### Build complet

Pour compiler TypeScript et recompiler le module natif :

```bash
npm run build
```

### Nettoyage et reconstruction complète

Si vous rencontrez des problèmes de compilation :

```bash
npm run clean
npm install
npm run build
```

## Utilisation

### Test multi-souris

1. Connectez plusieurs souris USB ou Bluetooth
2. Lancez l'application (`npm start`)
3. La détection Raw Input démarre automatiquement
4. Bougez chaque souris → un curseur indépendant apparaît pour chaque device

### Sortie console exemple

```
NOUVEAU DEVICE AJOUTE: Generic Mouse - Handle: 39259667
Nouveau curseur créé pour device: device_39259667 Generic Mouse

NOUVEAU DEVICE AJOUTE: Generic Mouse - Handle: 4263907
Nouveau curseur créé pour device: device_4263907 Generic Mouse
```

## Développement

### Lancement en mode développement

```bash
npm run dev
```

### Surveillance des changements TypeScript

```bash
npm run watch
```

### Linting et nettoyage du code

```bash
npm run lint
```

## 🚀 Build de production optimisé

### Build automatique (recommandé)

**Méthode interactive (toutes options)** :

```bash
# Script de choix avec 4 méthodes
choose-build-method.cmd
```

**Méthode 1 - Build intégré (afterPack)** :

```bash
# Build avec optimisations intégrées dans electron-builder
npm run dist:win-optimized
```

**Méthode 2 - Build CMD complet** :

```bash
# Script CMD pur avec compression manuelle
scripts\build-cmd-complet.cmd
```

**Méthode 3 - Build + PowerShell UPX** :

```bash
# Build puis compression PowerShell séparée
npm run pack:win
powershell -ExecutionPolicy Bypass -File scripts\compress-upx.ps1
```

**Méthode 4 - Scripts originaux** :

```bash
# Scripts Batch et PowerShell classiques
build-win.cmd
# ou
powershell -ExecutionPolicy Bypass -File .\build-win.ps1
```

### Build manuel étape par étape

```bash
# 1. Nettoyage
npm run clean

# 2. Compilation + rebuild
npm run compile
npm run rebuild

# 3. Optimisation des dépendances
npm prune --production
npm dedupe

# 4. Build des 3 formats
npm run pack:win
# Génère: Buenox-1.0.2-x64-win32.exe (NSIS installer)
#         Buenox-1.0.2-x64-win32.zip (ZIP portable)
#         Buenox Portable 1.0.2.exe (Portable)
```

### Scripts de build disponibles

- `npm run dist:win-optimized` : Build optimisé automatique
- `npm run pack:win` : Build NSIS + Portable + ZIP
- `npm run dist:nsis` : Installeur NSIS uniquement
- `npm run dist:portable` : Version portable uniquement
- `npm run dist:zip` : Archive ZIP uniquement

### Optimisations appliquées

✅ **Compression maximale** : `compression: "maximum"`
✅ **Filtrage agressif** : Exclusion des fichiers de développement
✅ **Locales minimales** : Seulement français et anglais
✅ **Suppression Chromium** : SwiftShader, PDF viewer, dev tools
✅ **Compression UPX** : Binaires EXE/DLL (si installé)
✅ **Nettoyage post-build** : Maps, PDB, fichiers temporaires

### Taille attendue

- **Avant optimisation** : ~120-150 Mo
- **Après optimisation** : ~75-95 Mo
- **Avec UPX** : ~60-80 Mo

## Problèmes courants

### Erreur NODE_MODULE_VERSION

**Symptôme** : Le module C++ a été compilé pour une version différente de Node.js/Electron.

**Solution** :

```bash
npx electron-rebuild
npm run build
```

### Erreurs de compilation C++

**Symptôme** : Erreurs liées aux outils de build ou SDK manquants.

**Solution** : Vérifiez que Visual Studio Build Tools 2022 est installé avec les composants requis.

### Application ne démarre pas

**Symptôme** : L'application ne se lance pas après build.

**Solution** :

```bash
npm run clean
npm install
npm run build
npm start
```

## Scripts disponibles

- `npm run install-deps` : Installe les dépendances
- `npm run compile` : Compile TypeScript uniquement
- `npm run rebuild` : Recompile le module natif
- `npm run build` : Build complet (TypeScript + module natif)
- `npm run start` : Lance l'application après build
- `npm run dev` : Lance en mode développement
- `npm run watch` : Surveillance des changements TypeScript
- `npm run lint` : Vérifie le code avec ESLint
- `npm run clean` : Nettoie et corrige le code

## Architecture

```
src/
├── main.ts                 # Processus principal Electron
├── renderer.ts             # Interface overlay
├── raw_input_detector.ts   # Wrapper API Raw Input
├── Buenox_addon.cpp    # Module C++ natif
└── types.ts               # Interfaces TypeScript
```

## Dépendances principales

- **Electron 26.0.0** : Framework application
- **TypeScript** : Langage principal
- **node-gyp** : Compilation module C++
- **Raw Input API** : Détection souris Windows native

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
- Essayez différentes souris USB/Bluetooth

### Erreurs de compilation

- Installez Visual Studio Build Tools 2022
- Vérifiez que le SDK Windows est installé
- Redémarrez après installation des outils

## Licence

MIT - Voir LICENSE pour détails

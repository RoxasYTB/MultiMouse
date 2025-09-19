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
   git clone https://github.com/RoxasYTB/MultiMouseElectron.git
   cd MultiMouseElectron
   ```

2. Installez les dépendances Node.js :
   ```bash
   npm install
   ```
   Cette commande installera automatiquement les dépendances et recompilera le module natif via le script `postinstall`.

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
├── multimouse_addon.cpp    # Module C++ natif
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
- Testez avec F4 (diagnostics) pour voir les devices disponibles
- Essayez différentes souris USB/Bluetooth

### Erreurs de compilation

- Installez Visual Studio Build Tools 2022
- Vérifiez que le SDK Windows est installé
- Redémarrez après installation des outils

## Licence

MIT - Voir LICENSE pour détails

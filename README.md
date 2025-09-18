# MultimouseElectron

Application Multimouse stable développée avec Electron.js qui permet d'utiliser plusieurs souris simultanément avec des curseurs indépendants. Utilise l'API Raw Input de Windows pour une détection précise des périphériques.

## ✨ Fonctionnalités

- 🖱️ **Multi-souris** : Gestion de plusieurs curseurs de souris simultanément
- 🎨 **Curseurs personnalisés** : Curseurs colorés avec détection automatique du type
- 👁️ **Overlay transparent** : Interface par-dessus toutes les applications
- ⌨️ **Contrôles globaux** : Raccourcis clavier pour contrôler l'application
- 💾 **Configuration persistante** : Paramètres sauvegardés automatiquement
- 🚀 **Hautes performances** : Rendu optimisé et synchronisation en temps réel
- 🔧 **Debug intégré** : Outils de diagnostic et informations détaillées

## 📋 Prérequis

### Obligatoires

- **Windows 10/11** (64-bit recommandé)
- **Node.js 18.0.0+** - [Télécharger ici](https://nodejs.org/)
- **Visual Studio Build Tools 2022** ou **Visual Studio Community 2022**

### Installation des Build Tools

1. Téléchargez [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/fr/downloads/#build-tools-for-visual-studio-2022)
2. Lancez l'installateur et sélectionnez :
   - ✅ **"Outils de build C++"**
   - ✅ **"SDK Windows 10/11"** (dernière version)
   - ✅ **"MSVC v143"** (compilateur)
3. Redémarrez votre ordinateur après l'installation

## 🚀 Installation et Build

### Étape 1 : Clonage du projet

```bash
git clone <url-du-repo>
cd MultimouseElectron
```

### Étape 2 : Installation des dépendances Node.js

```bash
npm install
```

### Étape 3 : Compilation du module natif

Cette étape est **cruciale** car l'application utilise un module C++ pour l'API Raw Input :

```bash
# Première compilation
npm run build

# Si vous avez des erreurs, essayez :
npx electron-rebuild

# En cas de problème persistant :
npm run rebuild
```

### Étape 4 : Vérification de l'installation

```bash
# Test de démarrage
npm start
```

Si l'application se lance et affiche "RawInput activé avec succès" dans la console, l'installation est réussie !

## 🎮 Utilisation

### Démarrage rapide

```bash
npm start
```

### Mode développement (avec logs détaillés)

```bash
npm run dev
```

### Contrôles principaux

- **Bougez vos souris** : Les curseurs apparaîtront automatiquement
- **Appuyez sur `Ctrl + D`** : Affiche les informations de debug
- **Appuyez sur `Échap`** : Quitte l'application

## 📦 Scripts NPM disponibles

| Commande          | Description                                    |
| ----------------- | ---------------------------------------------- |
| `npm start`       | Démarre l'application en mode production       |
| `npm run dev`     | Mode développement avec logs détaillés         |
| `npm run build`   | Compile le module natif C++                    |
| `npm run rebuild` | Recompile le module natif (en cas de problème) |
| `npm install`     | Installe toutes les dépendances                |

## ⌨️ Raccourcis clavier complets

### Contrôles de sensibilité

- `Ctrl + Shift + +` : Augmenter la sensibilité
- `Ctrl + Shift + -` : Diminuer la sensibilité
- `Ctrl + R` : Reset de la sensibilité à 1.0

### Test et debug

- `Ctrl + M` : Ajouter une souris de test
- `Ctrl + Shift + M` : Mouvement simulé (curseur 1)
- `Ctrl + Alt + M` : Mouvement simulé (curseur 2)
- `Ctrl + D` : Afficher/masquer les infos de debug
- `Ctrl + C` : Effacer toutes les souris de test

### Application

- `Échap` : Quitter l'application
- `F5` : Recharger l'overlay (mode dev)

## ⚙️ Configuration

Le fichier `config.json` est créé automatiquement au premier lancement avec ces paramètres :

```json
{
  "sensitivity": 1.5,
  "refreshRate": 1,
  "maxCursors": 4,
  "cursorSize": 20,
  "cursorColors": ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"],
  "highPerformanceMode": true,
  "precisePositioning": true
}
```

### Paramètres modifiables

| Paramètre             | Description               | Valeurs              |
| --------------------- | ------------------------- | -------------------- |
| `sensitivity`         | Sensibilité des curseurs  | 0.1 - 5.0            |
| `refreshRate`         | Taux de rafraîchissement  | 1-60                 |
| `maxCursors`          | Nombre max de curseurs    | 1-8                  |
| `cursorSize`          | Taille des curseurs (px)  | 10-50                |
| `cursorColors`        | Couleurs RGB des curseurs | Array de strings hex |
| `highPerformanceMode` | Mode haute performance    | true/false           |
| `precisePositioning`  | Positionnement précis     | true/false           |

## 🔧 Dépannage

### ❌ Problèmes courants et solutions

#### 1. Erreur "NODE_MODULE_VERSION mismatch"

```
Error: The module was compiled against a different Node.js version
```

**Solution :**

```bash
npx electron-rebuild
# OU
npm run rebuild
```

#### 2. Erreur "Python not found" ou "MSBuild not found"

```
gyp ERR! find Python / gyp ERR! find VS
```

**Solution :**

1. Installez Python 3.x depuis [python.org](https://python.org)
2. Installez Visual Studio Build Tools 2022
3. Redémarrez votre terminal
4. Relancez `npm run build`

#### 3. L'application ne détecte aucune souris

**Vérifications :**

- ✅ Toutes vos souris sont branchées et fonctionnelles
- ✅ L'application a été lancée avec succès (pas d'erreur RawInput)
- ✅ Vous avez bien bougé les souris après le lancement

**Test de diagnostic :**

```bash
npm start
# Dans l'application, appuyez sur Ctrl+D pour voir les périphériques détectés
# Appuyez sur Ctrl+M pour ajouter une souris de test
```

#### 4. L'overlay ne s'affiche pas

**Solutions :**

- Lancez l'application en tant qu'**Administrateur**
- Vérifiez qu'aucun antivirus ne bloque l'application
- Fermez et relancez l'application

#### 5. Erreurs de compilation C++

**Solution complète :**

```bash
# Nettoyage complet
rm -rf node_modules build
npm install
npm run build
```

### 📊 Debug et logs

#### Logs de diagnostic

```bash
# Démarrage avec logs détaillés
npm start

# Les logs montrent :
# ✅ "RawInput activé avec succès" = Module C++ OK
# ✅ "X périphériques détectés" = Souris détectées
# ✅ "Mouvement souris détecté" = Mouvements captés
```

#### Informations système

- Appuyez sur `Ctrl + D` dans l'application pour voir :
  - Nombre de périphériques connectés
  - Positions des curseurs en temps réel
  - Types de curseurs détectés
  - Statistiques de performance

### 🆘 Support technique

Si vous rencontrez toujours des problèmes :

1. **Vérifiez les prérequis** (Node.js 18+, Build Tools)
2. **Consultez les logs** (erreurs dans la console)
3. **Testez avec une souris simple** (débranchez les souris complexes)
4. **Redémarrez en Administrateur**

#### Collecte d'informations pour support

```bash
# Informations système
node --version
npm --version
echo %PROCESSOR_ARCHITECTURE%

# Test de build
npm run build > build.log 2>&1
```

## 🏗️ Architecture technique

### Structure du projet

```
MultimouseElectron/
├── main.js                    # Processus principal Electron
├── renderer.js                # Logique de l'overlay (rendu)
├── raw_input_detector.js      # Détection Raw Input Windows
├── cursor_type_detector.js    # Détection types de curseurs
├── overlay.html               # Interface HTML de l'overlay
├── overlay.css                # Styles de l'overlay
├── config.json               # Configuration utilisateur
├── binding.gyp               # Configuration build C++
├── src/
│   └── multimouse_addon.cpp  # Module natif C++ Raw Input
├── build/                    # Fichiers compilés
└── assets/                   # Ressources (curseurs, icônes)
```

### Technologies utilisées

- **Electron 26+** : Framework principal
- **Node.js 18+** : Runtime JavaScript
- **C++ / NAN** : Module natif pour Raw Input
- **Raw Input API** : Détection bas niveau des périphériques
- **HTML5/CSS3** : Interface utilisateur overlay

### Flux de données

1. **Raw Input C++** → Détecte mouvements souris
2. **RawInputDetector** → Traite et normalise les données
3. **Main Process** → Gère la logique métier
4. **IPC** → Communication inter-processus
5. **Renderer** → Affiche les curseurs dans l'overlay

## 📝 Développement

### Structure du code

- `main.js` : Gestion des fenêtres, IPC, configuration
- `renderer.js` : Logique d'affichage des curseurs
- `raw_input_detector.js` : Interface avec le module C++
- `src/multimouse_addon.cpp` : API Raw Input native

### Hot reload en développement

```bash
npm run dev
# Les fichiers JS sont rechargés automatiquement
# Pour le C++, utilisez : npm run build
```

### Debug avancé

```bash
# Variables d'environnement debug
DEBUG=* npm start

# Chrome DevTools pour l'overlay
# Ctrl+Shift+I dans l'application
```

## 📄 Licence

**MIT License**

Copyright (c) 2025 MultimouseElectron

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 🙏 Remerciements

- **Microsoft** pour l'API Raw Input
- **Electron Team** pour le framework
- **Node.js Community** pour l'écosystème
- **Contributors** qui ont aidé au développement

**Bon build ! 🚀**

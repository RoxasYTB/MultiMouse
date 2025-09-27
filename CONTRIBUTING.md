# Guide de Contribution - Orionix

Merci de votre intérêt pour contribuer à Orionix ! Ce guide vous explique comment participer efficacement au développement.

## 🚀 Démarrage Rapide

### Prérequis

- Node.js 18+
- Git
- Visual Studio Build Tools (pour les modules natifs)
- Windows 10/11 pour les tests

### Installation

```bash
git clone https://github.com/RoxasYTB/Orionix.git
cd Orionix
npm install
```

### Test de l'environnement

```bash
npm run build-safe    # Compilation TypeScript
npm start            # Lancement de l'application
```

## 📋 Types de Contributions

### 🐛 Correction de bugs

1. Créer une issue décrivant le problème
2. Fork le repository
3. Créer une branche : `git checkout -b fix/nom-du-bug`
4. Corriger et tester
5. Soumettre une PR

### ✨ Nouvelles fonctionnalités

1. Discuter de la fonctionnalité dans les Issues/Discussions
2. Fork et créer une branche : `git checkout -b feature/nom-fonctionnalite`
3. Développer avec tests
4. Documenter les changements
5. Soumettre une PR

### 📚 Documentation

- Améliorer le README
- Ajouter des commentaires dans le code
- Créer des guides d'utilisation
- Traduire la documentation

## 🏗️ Architecture du Projet

```
Orionix/
├── src/                          # Code source TypeScript
│   ├── main.ts                   # Process principal Electron
│   ├── renderer-browser.ts       # Rendu overlay
│   ├── types.ts                  # Définitions de types
│   ├── cursor_type_detector.ts   # Détection types curseurs
│   ├── raw_input_detector.ts     # Détection entrées raw
│   └── improved_usb_monitor.ts   # Surveillance USB
├── settingsInterface/            # Interface paramètres
│   ├── settings.html            # Interface utilisateur
│   ├── settings.js              # Logique + IPC
│   ├── settings.css             # Styles interface
│   └── config.js                # Configuration onglets
├── assets/                      # Ressources
│   ├── icon.ico                # Icône principale
│   ├── default/                # Curseurs par défaut
│   └── custom/                 # Curseurs personnalisés
└── bin/                        # Modules natifs compilés
    └── win32-x64-116/          # Module natif Windows
```

## 🎯 Domaines de Contribution

### Frontend (Electron Renderer)

- Interface overlay (HTML/CSS/JS)
- Interface paramètres (HTML/CSS/JS)
- Animations et transitions
- Responsive design

### Backend (Electron Main)

- Communication IPC
- Gestion des curseurs
- Configuration et persistance
- Intégration système Windows

### Modules Natifs (C++)

- Détection raw input
- Contrôle curseur système
- Optimisations performance
- Intégration API Windows

## 📝 Standards de Code

### TypeScript

```typescript
// Utiliser des types explicites
interface CursorData {
  id: string;
  x: number;
  y: number;
}

// Commentaires JSDoc pour les fonctions publiques
/**
 * Met à jour la position d'un curseur
 * @param cursorId - Identifiant unique du curseur
 * @param position - Nouvelle position
 */
function updateCursor(cursorId: string, position: { x: number; y: number }): void {
  // Implémentation
}
```

### Nomenclature

- **Variables** : camelCase (`cursorPosition`)
- **Constantes** : UPPER_SNAKE_CASE (`DEFAULT_CONFIG`)
- **Classes** : PascalCase (`CursorManager`)
- **Fichiers** : kebab-case (`cursor-detector.ts`)

### Commits

Format : `type(scope): description`

Types :

- `feat` : Nouvelle fonctionnalité
- `fix` : Correction de bug
- `docs` : Documentation
- `style` : Formatage/style
- `refactor` : Refactoring
- `perf` : Amélioration performance
- `test` : Tests
- `chore` : Maintenance

Exemples :

```
feat(settings): add dark mode toggle
fix(cursor): resolve z-index overlay issue
docs(readme): update installation instructions
```

## 🧪 Tests

### Tests Manuels

```bash
npm start                    # Test global
.\test-settings.cmd         # Test interface paramètres
```

### Zones de Test Critiques

1. **Détection multi-souris** : Connecter plusieurs souris
2. **Interface paramètres** : Tester tous les contrôles
3. **Communication IPC** : Vérifier la synchronisation
4. **Performance** : Surveiller l'utilisation CPU/RAM
5. **Overlay** : Tester la transparence et le z-index

## 🔍 Débogage

### Mode Debug

- Raccourci : `Ctrl+Shift+D`
- Affiche : coordonnées, FPS, Device IDs
- DevTools : F12 dans l'overlay

### Logs Utiles

```typescript
// Dans main.ts
console.log('=== DEBUG CURSOR ===', cursorData);

// Dans renderer
console.log('Renderer event:', eventType, data);
```

## 📊 Pull Request Process

### Checklist PR

- [ ] Code compilé sans erreurs
- [ ] Tests manuels effectués
- [ ] Documentation mise à jour
- [ ] Commit messages formatés
- [ ] Pas de fichiers de configuration personnels

### Review Process

1. **Vérification automatique** : Build, linting
2. **Review technique** : Architecture, performance
3. **Test fonctionnel** : Validation des fonctionnalités
4. **Merge** : Squash and merge préféré

## 🏷️ Système de Versions

Format : `v{major}.{minor}.{patch}`

- **Major** : Changements breaking
- **Minor** : Nouvelles fonctionnalités
- **Patch** : Corrections de bugs

## 🤝 Communauté

### Channels de Communication

- **Issues** : Bugs, demandes de fonctionnalités
- **Discussions** : Questions, idées, feedback
- **PR** : Reviews de code, suggestions

### Code of Conduct

- Respecter tous les contributeurs
- Fournir des critiques constructives
- Focus sur le code, pas la personne
- Aider les nouveaux contributeurs

## 🎯 Roadmap

### Priorités Actuelles

1. **Performance** : Optimisation rendering overlay
2. **UX** : Amélioration interface paramètres
3. **Stabilité** : Correction bugs critiques
4. **Documentation** : Guides utilisateur/développeur

### Fonctionnalités Futures

- Support multi-plateforme (Linux/macOS)
- Interface web distante
- Plugins personnalisables
- Export/import configurations

## 📞 Aide

Besoin d'aide ? N'hésitez pas :

1. **Lire la documentation** existante
2. **Chercher dans les Issues** similaires
3. **Créer une Discussion** pour les questions
4. **Mentionner @RoxasYTB** pour les questions techniques

---

**Merci de contribuer à Orionix ! 🎉**

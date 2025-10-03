# 🖥️ Système Multi-Écrans avec Offset

## Principe de Fonctionnement

Le système permet d'afficher les curseurs sur plusieurs écrans avec un **offset visuel** basé sur les bounds de chaque écran, tout en permettant un **mouvement libre sans limites**.

## Architecture

### 1. **Main Process (`main.ts`)**

#### Pas de limites de mouvement

```typescript
// Les curseurs peuvent avoir des coordonnées négatives et au-delà de l'écran
cursor.x = newX; // Pas de Math.max(0, Math.min(...))
cursor.y = newY;
```

#### Envoi à tous les overlays

```typescript
sendInstantCursorUpdate(cursor: CursorState): void {
  // Envoyer à TOUS les overlays avec les coordonnées globales
  this.sendToAllOverlays('cursor-position-update', {
    deviceId: cursor.id,
    x: cursor.x,  // Coordonnées globales
    y: cursor.y,
    cursorType: cursor.cursorType,
    isVisible: true,
  });
}
```

#### Configuration des overlays

```typescript
overlayWindow.webContents.send('screen-info', {
  displayId: display.id,
  bounds: display.bounds,
  offsetX: display.bounds.x, // Offset de l'écran
  offsetY: display.bounds.y,
});
```

### 2. **Renderer Process (`renderer-browser.ts`)**

#### Stockage de l'offset

```typescript
private screenOffsetX: number = 0;
private screenOffsetY: number = 0;
private screenWidth: number = 0;
private screenHeight: number = 0;
```

#### Application de l'offset visuel

```typescript
private updateCursorPositionInstant(d: any): void {
  // Calculer la position ajustée pour CET écran
  const adjustedX = d.x - this.screenOffsetX + ox;
  const adjustedY = d.y - this.screenOffsetY + oy;

  // Toujours afficher, pas de vérification de limites
  cursor.element.style.transform = `translate3d(${adjustedX}px, ${adjustedY}px, 0)`;
}
```

## Exemple Pratique

### Configuration

```json
[
  {
    "Ecran": 1,
    "Primary": true,
    "X": 0,
    "Y": 0,
    "Width": 1536,
    "Height": 864
  },
  {
    "Ecran": 2,
    "Primary": false,
    "X": -1536,
    "Y": 85,
    "Width": 1536,
    "Height": 865
  }
]
```

### Scénario

Un curseur à la position globale **`(500, 300)`**

#### Sur Overlay Écran 1

- Offset: `X=0, Y=0`
- Position affichée: `500 - 0 = 500px, 300 - 0 = 300px`
- ✅ **Visible à (500, 300)**

#### Sur Overlay Écran 2

- Offset: `X=-1536, Y=85`
- Position affichée: `500 - (-1536) = 2036px, 300 - 85 = 215px`
- ✅ **Visible à (2036, 215)** (hors de l'écran, donc pas visible visuellement)

### Déplacement vers l'écran 2

Curseur se déplace vers **`(-800, 300)`**

#### Sur Overlay Écran 1

- Position affichée: `-800 - 0 = -800px, 300 - 0 = 300px`
- ✅ **Hors de l'écran** (position négative, donc pas visible visuellement)

#### Sur Overlay Écran 2

- Position affichée: `-800 - (-1536) = 736px, 300 - 85 = 215px`
- ✅ **Visible à (736, 215)** dans l'écran 2

## Avantages

1. ✅ **Pas de duplication logique** : Chaque overlay reçoit les mêmes données
2. ✅ **Offset visuel automatique** : Chaque overlay applique son propre offset
3. ✅ **Mouvement libre** : Les curseurs peuvent aller partout (coordonnées négatives incluses)
4. ✅ **Simple à maintenir** : Un seul système d'envoi, offset côté client

## Script PowerShell de Diagnostic

```powershell
Add-Type -AssemblyName System.Windows.Forms

$screens = [System.Windows.Forms.Screen]::AllScreens
$result = @()

for ($i = 0; $i -lt $screens.Count; $i++) {
    $scr = $screens[$i]
    $bounds = $scr.Bounds

    $result += [PSCustomObject]@{
        Ecran   = $i + 1
        Primary = $scr.Primary
        X       = $bounds.X
        Y       = $bounds.Y
        Width   = $bounds.Width
        Height  = $bounds.Height
    }
}

$result | ConvertTo-Json -Depth 3
```

Ce script permet de connaître les bounds de tous les écrans pour comprendre comment les offsets sont appliqués.

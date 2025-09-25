$ErrorActionPreference = 'Stop'

# Détecter si nous sommes dans une distribution Electron
$isDistribution = $false
if ($env:PORTABLE_EXECUTABLE_DIR -or $env:LOCALAPPDATA -match "Buenox" -or (Test-Path "resources\app.asar")) {
    $isDistribution = $true
    Write-Host "Mode distribution détecté"
}

$cursorKey = 'HKCU:\Control Panel\Cursors'
$currentCursors = Get-ItemProperty -Path $cursorKey

# mapping friendly → registre
$map = @{
    'arrow'       = 'Arrow'
    'hand'        = 'Hand'
    'help'        = 'Help'
    'wait'        = 'Wait'
    'appstarting' = 'AppStarting'
    'no'          = 'No'
    'cross'       = 'Cross'
    'ibeam'       = 'IBeam'
    'sizens'      = 'SizeNS'
    'sizewe'      = 'SizeWE'
    'sizenwse'    = 'SizeNWSE'
    'sizenesw'    = 'SizeNESW'
    'sizeall'     = 'SizeAll'
    'uparrow'     = 'UpArrow'
    'move'        = 'Move'
    'link'        = 'Link'
    'horizontal'  = 'SizeWE'
    'vertical'    = 'SizeNS'
    'diagonal1'   = 'SizeNWSE'
    'diagonal2'   = 'SizeNESW'
    'handwriting' = 'Pen'
    'precision'   = 'Precision'
    'text'        = 'IBeam'
    'busy'        = 'Wait'
    'unavailable' = 'No'
    'normal'      = 'Arrow'
}

function Ensure-Dir {
    param([string]$path)
    if (-not (Test-Path $path)) {
        try {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
            Write-Host "Dossier créé: $path"
        } catch {
            Write-Warning "Impossible de créer le dossier $path : $_"
        }
    }
}

Ensure-Dir -path 'assets\custom'
Ensure-Dir -path 'assets\default'

# Nettoyer le dossier custom avant de commencer (supprimer tous les fichiers, pas le dossier)
Write-Host "Nettoyage du dossier assets\custom..."
try {
    Get-ChildItem -Path 'assets\custom' -File -ErrorAction SilentlyContinue | Remove-Item -Force
    Write-Host "Dossier custom nettoyé."
} catch {
    Write-Warning "Erreur lors du nettoyage: $_"
}

# Vérifier et créer les fichiers curseur manquants dans assets/default
Write-Host "Vérification des fichiers curseur par défaut..."
$defaultMappings = @{
    'arrow.cur' = 'normal.cur'
    'ibeam.cur' = 'text.cur'
    'no.cur' = 'unavailable.cur'
    'sizenesw.cur' = 'diagonal2.cur'
    'sizens.cur' = 'vertical.cur'
    'wait.cur' = 'busy.cur'
    'sizenwse.cur' = 'diagonal1.cur'
    'sizewe.cur' = 'horizontal.cur'
    'cross.cur' = 'precision.cur'
    'uparrow.cur' = 'normal.cur'
}

foreach ($target in $defaultMappings.Keys) {
    $targetPath = "assets\default\$target"
    $sourcePath = "assets\default\$($defaultMappings[$target])"

    if (-not (Test-Path $targetPath)) {
        if (Test-Path $sourcePath) {
            Copy-Item $sourcePath $targetPath
            Write-Host "Créé: $target (copié depuis $($defaultMappings[$target]))"
        } else {
            Write-Warning "Fichier source manquant: $sourcePath"
        }
    }
}
Write-Host "Vérification terminée."

$result = @{}
$resultToUse = @{}
$batchConversions = @()

# Fonction pour normaliser les chemins avec des slashes normaux et le préfixe assets/
function Normalize-Path {
    param([string]$path)
    # Remplacer les backslashes par des slashes normaux
    $normalized = $path -replace '\\', '/'
    # Si le chemin ne commence pas par assets/, l'ajouter
    if (-not $normalized.StartsWith('assets/')) {
        $normalized = "assets/$normalized"
    }
    return $normalized
}

# Fonction pour normaliser les chemins système (remplacer \\ par /)
function Normalize-SystemPath {
    param([string]$path)
    return $path -replace '\\\\', '/' -replace '\\', '/'
}

foreach ($friendly in $map.Keys) {
    $regName = $map[$friendly]
    $val = $null
    try { $val = $currentCursors.$regName } catch { $val = $null }

    if ([string]::IsNullOrWhiteSpace($val)) {
        # Valeur vide → défaut
        $defaultPath = "assets/default/$friendly.cur"
        $result[$friendly] = $defaultPath
        $resultToUse[$friendly] = $defaultPath
        continue
    }

    $lower = $val.ToLower()
    if ($lower.EndsWith('.cur')) {
        # Curseur custom en .cur - copier vers assets/custom pour éviter les problèmes de sécurité
        $normalizedSystemPath = Normalize-SystemPath $val
        $result[$friendly] = $normalizedSystemPath

        # Copier le fichier .cur vers assets/custom avec un nom unique
        $safeName = $friendly
        $customCurPath = Join-Path 'assets\custom' ("$safeName.cur")

        try {
            if (Test-Path $val) {
                Copy-Item $val $customCurPath -Force
                Write-Host "Copié: $val -> $customCurPath"
                # Utiliser le chemin local normalisé pour resultToUse
                $normalizedCustomPath = Normalize-Path $customCurPath
                $resultToUse[$friendly] = $normalizedCustomPath
            } else {
                Write-Warning "Fichier curseur introuvable: $val"
                # Fallback vers les assets par défaut
                $defaultPath = "assets/default/$friendly.cur"
                $resultToUse[$friendly] = $defaultPath
            }
        } catch {
            Write-Warning "Erreur lors de la copie de $val : $_"
            # Fallback vers les assets par défaut
            $defaultPath = "assets/default/$friendly.cur"
            $resultToUse[$friendly] = $defaultPath
        }
        continue
    }

    if ($lower.EndsWith('.ani')) {
        # Curseur .ani → conversion gif - normaliser le chemin système
        $normalizedSystemPath = Normalize-SystemPath $val
        $result[$friendly] = $normalizedSystemPath
        $safeName = $friendly
        $gifPath = Join-Path 'assets\custom' ("$safeName.gif")

        # Ajouter à la liste des conversions en lot
        $batchConversions += @{
            input = $val
            output = $gifPath
        }

        # Normaliser le chemin pour resultToUse
        $normalizedGifPath = Normalize-Path $gifPath
        $resultToUse[$friendly] = $normalizedGifPath
        continue
    }

    # Fallback : on écrit la valeur brute dans result, mais normalisée dans resultToUse
    $normalizedSystemPath = Normalize-SystemPath $val
    $result[$friendly] = $normalizedSystemPath
    $normalizedPath = Normalize-Path $val
    $resultToUse[$friendly] = $normalizedPath
}

# Traitement en lot des conversions ANI -> GIF
if ($batchConversions.Count -gt 0) {
    Write-Host "Préparation des conversions ANI -> GIF en parallèle ($($batchConversions.Count) fichiers)..."

    # Créer un fichier JSON temporaire pour les conversions en lot
    $batchFile = 'batch_conversions.json'
    $batchConversions | ConvertTo-Json -Depth 4 | Out-File -Encoding ascii $batchFile

    Write-Host "Lancement des conversions en parallèle..."

    # Exécuter les conversions en parallèle
    $node = 'node'
    $script = 'ani-to-gif.mjs'
    try {
        & $node $script --batch $batchFile
        Write-Host "Conversions terminées avec succès!"
    } catch {
        Write-Warning "Erreur lors des conversions en lot : $_"
    }

    # Nettoyer le fichier temporaire
    if (Test-Path $batchFile) {
        Remove-Item $batchFile
    }
}

# Sauvegarder les JSON
$result | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 cursors.json
$resultToUse | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 cursorsToUse.json

Write-Host "Export terminé. Fichiers générés : cursors.json, cursorsToUse.json"

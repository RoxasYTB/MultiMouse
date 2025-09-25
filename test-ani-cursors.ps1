# Script de test pour changer temporairement les curseurs système vers ANI
Write-Host "=== TEST: Installation temporaire de curseurs ANI ===" -ForegroundColor Green

# Sauvegarde des curseurs actuels
$backupFile = "cursor_backup.json"
if (Test-Path $backupFile) {
    Write-Host "Fichier de sauvegarde existant trouvé : $backupFile" -ForegroundColor Yellow
} else {
    Write-Host "Création de la sauvegarde des curseurs actuels..." -ForegroundColor Blue
    $currentCursors = Get-ItemProperty -Path 'HKCU:\Control Panel\Cursors'
    $backup = @{}
    'Arrow','Hand','Help','Wait','AppStarting','No','Cross','IBeam','SizeNS','SizeWE','SizeNWSE','SizeNESW','SizeAll','UpArrow','Move','Link','Pen','Precision' | ForEach-Object {
        $backup[$_] = $currentCursors.$_
    }
    $backup | ConvertTo-Json | Out-File -Encoding UTF8 $backupFile
    Write-Host "Sauvegarde créée avec succès." -ForegroundColor Green
}

Write-Host "Pour tester avec des curseurs ANI, vous devez :"
Write-Host "1. Télécharger un pack de curseurs ANI"
Write-Host "2. Les installer manuellement via les Paramètres Windows"
Write-Host "3. Relancer le script export-cursors.ps1"
Write-Host "4. Démarrer l'application pour voir les GIFs convertis"
Write-Host ""
Write-Host "Script prêt ! Utilisez 'npm run start-safe' pour tester." -ForegroundColor Green
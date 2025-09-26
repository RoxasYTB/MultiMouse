@echo off
echo ===========================================
echo            ORIONIX - Démarrage complet
echo ===========================================
echo.
echo 1. Export et conversion des curseurs...
powershell -ExecutionPolicy Bypass -File export-cursors.ps1
if %errorlevel% neq 0 (
    echo ERREUR: Échec de l'export des curseurs
    pause
    exit /b 1
)
echo.
echo 2. Compilation TypeScript...
call npm run build-safe
if %errorlevel% neq 0 (
    echo ERREUR: Échec de la compilation
    pause
    exit /b 1
)
echo.
echo 3. Lancement de l'application...
npx electron .
echo.
echo Application fermée.
pause
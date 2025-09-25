@echo off
echo Compilation TypeScript...
npx tsc
if %errorlevel% neq 0 (
    echo Erreur de compilation TypeScript
    pause
    exit /b 1
)

echo Lancement de l'application...
npx electron .
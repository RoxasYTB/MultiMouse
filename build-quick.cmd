@echo off
setlocal

echo ========================================
echo    ORIONIX - Build Rapide (Fix Blocage)
echo ========================================
echo.

echo Ce build utilise une compression normale pour éviter les blocages
echo et une optimisation manuelle post-build plus efficace.
echo.

echo [1/5] Nettoyage...
call npm run clean

echo [2/5] Compilation...
call npm run compile
if errorlevel 1 goto :error

echo [3/5] Build Electron (compression normale)...
call npx electron-builder --win portable
if errorlevel 1 goto :error

echo [4/5] Optimisation manuelle post-build...
set BUILD_DIR=dist\win-unpacked

if not exist "%BUILD_DIR%" (
    echo ❌ Dossier de build non trouvé
    goto :error
)

REM Calculer taille avant
echo   📦 Calcul de la taille initiale...

REM Suppression aggressive des gros fichiers inutiles
echo   🗑 Suppression des gros fichiers Chromium...
del "%BUILD_DIR%\LICENSES.chromium.html" >nul 2>&1
del "%BUILD_DIR%\vk_swiftshader.dll" >nul 2>&1
del "%BUILD_DIR%\vulkan-1.dll" >nul 2>&1
del "%BUILD_DIR%\snapshot_blob.bin" >nul 2>&1
del "%BUILD_DIR%\chrome_200_percent.pak" >nul 2>&1

REM Supprimer dossiers inutiles
rmdir /s /q "%BUILD_DIR%\swiftshader" >nul 2>&1
rmdir /s /q "%BUILD_DIR%\inspector" >nul 2>&1

REM Nettoyer locales (garder seulement fr et en-US)
if exist "%BUILD_DIR%\locales" (
    echo   🌐 Nettoyage des locales...
    cd "%BUILD_DIR%\locales"
    for %%f in (*.pak) do (
        if not "%%f"=="en-US.pak" if not "%%f"=="fr.pak" (
            del "%%f" >nul 2>&1
        )
    )
    cd ..\..\..\..
)

echo [5/5] Création des archives optimisées...

REM Créer ZIP manuellement (plus fiable)
if exist "dist\Orionix-1.0.2-x64-win.zip" del "dist\Orionix-1.0.2-x64-win.zip"
powershell -Command "Compress-Archive -Path 'dist\win-unpacked\*' -DestinationPath 'dist\Orionix-1.0.2-x64-win.zip' -CompressionLevel Optimal" 2>nul

REM Créer l'installeur NSIS séparément si souhaité
echo.
set /p create_nsis=Créer aussi l'installeur NSIS? (o/N):
if /i "%create_nsis%"=="o" (
    echo   📦 Création de l'installeur NSIS...
    call npx electron-builder --win nsis --prepackaged "dist\win-unpacked"
)

echo.
echo ========================================
echo          RÉSULTATS DU BUILD
echo ========================================

if exist "dist" (
    echo 📄 Fichiers générés:
    for %%f in (dist\*.*) do (
        if not "%%f"=="dist\win-unpacked" (
            for %%a in ("%%f") do (
                set size=%%~za
                set /a sizeMB=!size!/1048576
                echo   • %%~nxf ^(!sizeMB! Mo^)
            )
        )
    )
)

echo.
echo ✅ Build rapide terminé !
echo 💡 Utilise compression normale pour éviter les blocages
echo 🗜 Gros fichiers Chromium supprimés manuellement
echo.
goto :end

:error
echo.
echo ❌ Erreur lors du build !
echo.

:end
pause
endlocal
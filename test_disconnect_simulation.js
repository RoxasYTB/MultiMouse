const { spawn } = require('child_process');

console.log('=== TEST DE SIMULATION DE DECONNEXION ===');

const powershellScript = `
Write-Host "=== SIMULATION DE DECONNEXION DE SOURIS ==="

# Afficher les périphériques de pointage actuels
Write-Host "Périphériques de pointage avant simulation:"
Get-WmiObject -Class Win32_PointingDevice | Where-Object {$_.Status -eq 'OK'} | Select-Object Name, DeviceID

Write-Host ""
Write-Host "Simulation d'une déconnexion... (cette simulation peut ne pas déclencher d'événement Windows réel)"
Write-Host "Pour tester réellement, débranchez physiquement une souris USB ou désactivez un périphérique dans le Gestionnaire de périphériques."

# Attendre un peu
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Vérification des périphériques après simulation:"
Get-WmiObject -Class Win32_PointingDevice | Where-Object {$_.Status -eq 'OK'} | Select-Object Name, DeviceID
`;

const powerShell = spawn('powershell', ['-Command', powershellScript], {
  stdio: 'inherit',
});

powerShell.on('close', (code) => {
  console.log(`\n=== SIMULATION TERMINEE (code: ${code}) ===`);
  console.log('\nPour tester vraiment la déconnexion:');
  console.log('1. Branchez une souris USB supplémentaire');
  console.log('2. Bougez-la pour créer un curseur');
  console.log('3. Débranchez-la pour voir si le curseur disparaît');
  console.log('4. Ou ouvrez le Gestionnaire de périphériques et désactivez un périphérique de pointage');
});

powerShell.on('error', (error) => {
  console.error("Erreur lors de l'exécution du script:", error);
});


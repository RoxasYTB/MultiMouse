console.log("🧪 Test du système de reset d'Orionix");

setTimeout(() => {
  console.log('📋 Lecture de la config actuelle...');

  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, 'config.json');

  const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('⚙️ Configuration actuelle:', {
    sensitivity: currentConfig.sensitivity,
    refreshRate: currentConfig.refreshRate,
    cursorSpeed: currentConfig.cursorSpeed,
    overlayDebug: currentConfig.overlayDebug,
  });

  console.log('🔄 Le reset devrait remettre:');
  console.log('   - sensitivity: 1.5 (au lieu de', currentConfig.sensitivity + ')');
  console.log('   - refreshRate: 1 (au lieu de', currentConfig.refreshRate + ')');
  console.log('   - cursorSpeed: 1.0 (au lieu de', currentConfig.cursorSpeed + ')');

  console.log('\n🎯 Pour tester le reset:');
  console.log("1. Double-clic sur l'icône tray pour ouvrir les settings");
  console.log('2. Cliquer sur le bouton "Reset" en bas');
  console.log('3. Vérifier que config.json est mis à jour');
  console.log("4. Vérifier que l'interface visuelle reflète les changements");
}, 2000);


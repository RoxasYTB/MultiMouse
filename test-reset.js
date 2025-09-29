const { ipcRenderer } = require('electron');

console.log('Test des handlers IPC...');

ipcRenderer
  .invoke('reset-config')
  .then((result) => {
    console.log('✅ Reset config result:', result);
  })
  .catch((err) => {
    console.error('❌ Reset config error:', err);
  });

ipcRenderer
  .invoke('reset-to-defaults')
  .then((result) => {
    console.log('✅ Reset to defaults result:', result);
  })
  .catch((err) => {
    console.error('❌ Reset to defaults error:', err);
  });

ipcRenderer
  .invoke('get-system-cursor-size')
  .then((size) => {
    console.log('✅ System cursor size:', size);
  })
  .catch((err) => {
    console.error('❌ System cursor size error:', err);
  });


const { ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

ipcMain.on('reset-all-settings', (event, defaultSettings) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(defaultSettings, null, 2));

    event.reply('settings-reset-complete', defaultSettings);
  } catch (error) {
    console.error('Error resetting config.json:', error);
  }
});

ipcMain.handle('open-external-powershell', async (event, url) => {
  try {
    const powershellProcess = spawn('powershell', ['-Command', `Start-Process "${url}"`], {
      shell: true,
      stdio: 'ignore',
      detached: true,
    });

    powershellProcess.unref();

    return { success: true };
  } catch (error) {
    console.error('Error opening URL via PowerShell:', error);

    shell.openExternal(url);
    return { success: false, fallback: true };
  }
});

ipcMain.handle('get-system-cursor-size', async (event) => {
  try {
    const powershellCommand = `Get-ItemProperty "HKCU:\\Control Panel\\Cursors" | Select-Object -ExpandProperty CursorBaseSize`;

    return new Promise((resolve) => {
      const process = spawn('powershell', ['-Command', powershellCommand], {
        shell: true,
        stdio: 'pipe',
      });

      let output = '';
      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        const size = parseInt(output.trim());
        const cursorSize = isNaN(size) ? 32 : size;

        resolve(cursorSize);
      });

      process.on('error', (error) => {
        console.error('Error getting cursor size:', error);
        resolve(32);
      });
    });
  } catch (error) {
    console.error('Error getting system cursor size:', error);
    return 32;
  }
});

ipcMain.on('open-external-powershell', (event, url) => {
  try {
    const powershellProcess = spawn('powershell', ['-Command', `Start-Process "${url}"`], {
      shell: true,
      stdio: 'ignore',
      detached: true,
    });

    powershellProcess.unref();
  } catch (error) {
    console.error('Error opening URL via PowerShell:', error);
    shell.openExternal(url);
  }
});

ipcMain.on('get-system-cursor-size', async (event) => {
  try {
    const size = await ipcMain.handle('get-system-cursor-size')();
    event.reply('system-cursor-size', size);
  } catch (error) {
    console.error('Error getting system cursor size:', error);
    event.reply('system-cursor-size', 32);
  }
});


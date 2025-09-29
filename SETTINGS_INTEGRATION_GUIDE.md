# Settings Interface Updates - Integration Guide

## Changes Made

### 1. UI Language Changed to English

- `settings.html` lang attribute changed from "fr" to "en"
- All slide text in `config.js` translated to English
- Reset button text changed to "Reset Settings"

### 2. External Link Handling Fixed

- Links now open via PowerShell using `start` command instead of in Electron window
- Uses `ipcRenderer.send('open-external-powershell', url)`

### 3. Reset Settings Button Added & Fixed

- Button properly renders at bottom of settings interface
- Correctly resets all settings to default values
- Clears localStorage and updates UI immediately

### 4. System Cursor Size Detection

- Added function to get Windows cursor size from registry
- Uses PowerShell command: `Get-ItemProperty "HKCU:\Control Panel\Cursors" | Select-Object -ExpandProperty CursorBaseSize`
- This value can be used to scale HTML cursor display to match user's system cursor size

### 5. Multi-Screen Responsive Design

- Removed `overflow: hidden` from body to allow scrolling
- Added responsive margins for large and ultra-wide screens
- Better support for 1920px, 2560px+ displays
- Content max-width prevents stretching on very large screens

## Required Main Process Integration

Add the following to your main Electron process:

```javascript
const { ipcMain, shell } = require('electron');
const { spawn } = require('child_process');

// Open URLs via PowerShell
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
    shell.openExternal(url); // Fallback
  }
});

// Get system cursor size
ipcMain.on('get-system-cursor-size', async (event) => {
  try {
    const powershellCommand = `Get-ItemProperty "HKCU:\\Control Panel\\Cursors" | Select-Object -ExpandProperty CursorBaseSize`;

    const process = spawn('powershell', ['-Command', powershellCommand], {
      shell: true,
      stdio: 'pipe',
    });

    let output = '';
    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', () => {
      const size = parseInt(output.trim());
      const cursorSize = isNaN(size) ? 32 : size;
      event.reply('system-cursor-size', cursorSize);
    });
  } catch (error) {
    console.error('Error getting system cursor size:', error);
    event.reply('system-cursor-size', 32);
  }
});
```

## How to Use System Cursor Size

The system cursor size is now available in `this.systemCursorSize` after initialization. Use it to scale your HTML cursors:

```javascript
// Example: Scale HTML cursor based on system size
const scaleRatio = this.systemCursorSize / 32; // 32 is default size
document.getElementById('cursor').style.transform = `scale(${scaleRatio})`;
```

## Files Modified

- `config.js` - UI text translations, reset button config
- `settings.js` - Reset functionality, external links, cursor size detection
- `settings.css` - Multi-screen responsive design
- `settings.html` - Language attribute change

All functionality should now work properly across multiple monitors and screen sizes.

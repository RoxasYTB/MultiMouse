const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const chokidar = require('chokidar');

if (process.platform === 'win32') {
  exec('chcp 65001');
}
const RawInputMouseDetector = require('./raw_input_detector');
const CursorTypeDetector = require('./cursor_type_detector');

const DEFAULT_CONFIG = {
  sensitivity: 1.5,
  refreshRate: 1,
  maxCursors: 4,
  cursorSize: 20,
  cursorColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
  highPerformanceMode: true,
  precisePositioning: true,
};

class MultimouseApp {
  constructor() {
    this.overlayWindow = null;
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = path.join(__dirname, 'config.json');
    this.cursors = new Map();
    this.isShuttingDown = false;
    this.lastActiveDevice = null;

    this.screenWidth = 800;
    this.screenHeight = 600;
    this.centerX = this.screenWidth / 2;
    this.centerY = this.screenHeight / 2;
    this.keepSystemCursorCentered = true;
    this.systemCursorLocked = false;

    this.lastRenderTime = 0;
    this.targetFPS = 1000;
    this.frameInterval = 1000 / this.targetFPS;
    this.renderRequestId = null;
    this.highPrecisionTimer = null;

    this.lastSystemCursorPos = { x: 0, y: 0 };
    this.systemCursorUpdatePending = false;

    this.lastLogTime = 0;
    this.logThrottle = 2000;

    this.mouseDetector = new RawInputMouseDetector();
    this.cursorTypeDetector = new CursorTypeDetector();

    this.setupMouseEvents();
    this.setupCursorTypeEvents();
    this.loadConfig();
    this.setupAppEvents();
    this.setupFileWatcher();
    this.initHighPerformanceLoop();
  }

  initHighPerformanceLoop() {
    if (this.config.highPerformanceMode) {
      this.startHighPrecisionRendering();
    }
  }

  startHighPrecisionRendering() {
    const render = () => {
      const now = performance.now();
      if (now - this.lastRenderTime >= this.frameInterval) {
        this.lastRenderTime = now;
        this.updateCursorPositionsHighPrecision();
      }

      if (!this.isShuttingDown) {
        this.renderRequestId = setImmediate(render);
      }
    };

    this.renderRequestId = setImmediate(render);
  }

  updateCursorPositionsHighPrecision() {
    if (this.lastActiveDevice && this.cursors.has(this.lastActiveDevice)) {
      const cursor = this.cursors.get(this.lastActiveDevice);

      this.syncSystemCursorToHTML(cursor);
    }

    this.updateOverlayInstantly();
  }

  syncSystemCursorToHTML(cursor) {
    if (!this.systemCursorUpdatePending) {
      this.systemCursorUpdatePending = true;

      setImmediate(() => {
        const systemCoords = this.convertHTMLToSystemCoordinates(cursor.x, cursor.y);
        const targetX = Math.round(systemCoords.x);
        const targetY = Math.round(systemCoords.y);

        if (Math.abs(this.lastSystemCursorPos.x - targetX) > 0 || Math.abs(this.lastSystemCursorPos.y - targetY) > 0) {
          if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
            this.mouseDetector.rawInputModule.setSystemCursorPos(targetX, targetY);
            this.lastSystemCursorPos = { x: targetX, y: targetY };
          }
        }

        this.systemCursorUpdatePending = false;
      });
    }
  }

  updateOverlayInstantly() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      const activeCursors = Array.from(this.cursors.values())
        .filter((c) => c.hasMovedOnce)
        .map((c) => ({
          deviceId: c.id,
          deviceName: c.deviceName,
          deviceHandle: c.deviceHandle,
          x: c.x,
          y: c.y,
          color: c.color,
          isRawInput: c.isRawInput,
          cursorType: c.cursorType,
          cursorCSS: c.cursorCSS,
          cursorFile: c.cursorFile,
          isVisible: true,
        }));

      const now = Date.now();
      if (activeCursors.length > 0 && now - this.lastLogTime > this.logThrottle) {
        activeCursors.forEach((c) => {});
        this.lastLogTime = now;
      }

      this.overlayWindow.webContents.send('cursors-instant-update', {
        cursors: activeCursors,
        lastActiveDevice: this.lastActiveDevice,
        timestamp: performance.now(),
      });
    }
  }

  setupFileWatcher() {
    const filesToWatch = [path.join(__dirname, 'overlay.css'), path.join(__dirname, 'overlay.html'), path.join(__dirname, 'renderer.js')];

    this.fileWatcher = chokidar.watch(filesToWatch, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
    });

    this.fileWatcher.on('change', (filePath) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        if (filePath.endsWith('.css')) {
          this.overlayWindow.webContents.reload();
        } else {
          this.overlayWindow.webContents.reload();
        }
      }
    });
  }

  setupMouseEvents() {
    this.mouseDetector.on('deviceAdded', () => {
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('deviceRemoved', (device) => {
      this.removeCursor(device.id);
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('mouseMove', (data) => {
      this.handleMouseMove(data);
    });

    this.mouseDetector.on('started', () => {});
    this.mouseDetector.on('stopped', () => {});
  }

  setupCursorTypeEvents() {
    this.cursorTypeDetector.onCursorChange((newType) => {
      if (this.lastActiveDevice && this.cursors.has(this.lastActiveDevice)) {
        const cursor = this.cursors.get(this.lastActiveDevice);
        cursor.cursorType = newType;
        cursor.cursorCSS = this.cursorTypeDetector.getCursorCSS(newType);
        cursor.cursorFile = this.cursorTypeDetector.getCursorFile(newType);
      }

      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('cursor-type-changed', {
          type: newType,
          cssClass: this.cursorTypeDetector.getCursorCSS(newType),
          file: this.cursorTypeDetector.getCursorFile(newType),
          filePath: this.cursorTypeDetector.getCursorFilePath(newType),
          activeDeviceId: this.lastActiveDevice,
        });
      }
    });
  }

  setupAppEvents() {
    app.whenReady().then(() => {
      const primaryDisplay = screen.getPrimaryDisplay();
      this.screenWidth = primaryDisplay.size.width;
      this.screenHeight = primaryDisplay.size.height;
      this.fullScreenWidth = primaryDisplay.size.width;
      this.fullScreenHeight = primaryDisplay.size.height;
      this.centerX = this.screenWidth / 2;
      this.centerY = this.screenHeight / 2;

      this.calibrateCoordinateMapping();
      this.startMouseInput();
      this.createOverlayWindow();
      this.setupIPC();
      this.setupGlobalShortcuts();

      screen.on('display-metrics-changed', () => {
        this.updateScreenDimensions();
      });

      screen.on('display-added', () => {
        this.updateScreenDimensions();
      });

      screen.on('display-removed', () => {
        this.updateScreenDimensions();
      });
    });

    app.on('window-all-closed', () => {
      this.shutdown();
    });

    app.on('before-quit', () => {
      this.saveConfig();
      globalShortcut.unregisterAll();
    });
  }

  updateScreenDimensions() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const newWidth = primaryDisplay.size.width;
    const newHeight = primaryDisplay.size.height;

    if (this.screenWidth !== newWidth || this.screenHeight !== newHeight) {
      this.screenWidth = newWidth;
      this.screenHeight = newHeight;
      this.centerX = this.screenWidth / 2;
      this.centerY = this.screenHeight / 2;

      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.close();
        setTimeout(() => {
          this.createOverlayWindow();
        }, 100);
      }

      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('screen-dimensions-changed', {
          width: this.screenWidth,
          height: this.screenHeight,
          centerX: this.centerX,
          centerY: this.centerY,
        });
      }
    }
  }

  async calibrateCoordinateMapping() {
    try {
      let currentSystemPos = null;
      if (this.mouseDetector.rawInputModule?.getSystemCursorPos) {
        currentSystemPos = this.mouseDetector.rawInputModule.getSystemCursorPos();
      } else {
        currentSystemPos = screen.getCursorScreenPoint();
      }

      if (currentSystemPos) {
        this.calibrationRatioX = 1.0;
        this.calibrationRatioY = 1.0;
        this.correctionFactorX = 1.0;
        this.correctionFactorY = 1.0;
      } else {
        this.calibrationRatioX = 1.0;
        this.calibrationRatioY = 1.0;
        this.correctionFactorX = 1.0;
        this.correctionFactorY = 1.0;
      }
    } catch (error) {
      this.calibrationRatioX = 1.0;
      this.calibrationRatioY = 1.0;
      this.correctionFactorX = 1.0;
      this.correctionFactorY = 1.0;
    }
  }

  convertHTMLToSystemCoordinates(htmlX, htmlY) {
    return {
      x: htmlX * 1.25,
      y: htmlY * 1.25,
    };
  }

  analyzeCoordinateAccuracy(htmlPos, systemPos) {
    if (!htmlPos || !systemPos) return;
    const deltaX = Math.abs(systemPos.x - htmlPos.x);
    const deltaY = Math.abs(systemPos.y - htmlPos.y);
    if (deltaX > 2 || deltaY > 2) {
    }
  }

  convertSystemToHTMLCoordinates(systemX, systemY) {
    return {
      x: systemX,
      y: systemY,
    };
  }

  startMouseInput() {
    try {
      const success = this.mouseDetector.start();

      if (success) {
        this.centerSystemCursor();
      } else {
      }
    } catch (error) {}

    try {
      this.cursorTypeDetector.start();
    } catch (error) {}
  }

  centerSystemCursor() {
    if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
      this.mouseDetector.rawInputModule.setSystemCursorPos(this.centerX, this.centerY);
    }
  }

  handleMouseMove(mouseData) {
    const cursorId = mouseData.deviceId;
    const deviceName = mouseData.deviceName || 'Device Inconnu';
    const isRawInput = mouseData.isRawInput || false;
    const deviceHandle = mouseData.deviceHandle || 'unknown';
    const dx = mouseData.dx || 0;
    const dy = mouseData.dy || 0;

    if (dx === 0 && dy === 0) {
      return;
    }

    let cursor = this.cursors.get(cursorId);
    if (!cursor) {
      const colorIndex = this.getStableColorIndex(cursorId);
      cursor = {
        id: cursorId,
        deviceName: deviceName,
        deviceHandle: deviceHandle,
        x: this.centerX,
        y: this.centerY,
        color: this.config.cursorColors[colorIndex],
        lastUpdate: performance.now(),
        isRawInput: isRawInput,
        cursorType: 'arrow',
        cursorCSS: 'cursor-type-arrow',
        cursorFile: 'aero_arrow.cur',
        hasMovedOnce: false,
        totalMovement: 0,
      };
      this.cursors.set(cursorId, cursor);
    }

    const newX = cursor.x + dx * this.config.sensitivity;
    const newY = cursor.y + dy * this.config.sensitivity;

    cursor.x = Math.max(0, Math.min(this.screenWidth, newX));
    cursor.y = Math.max(0, Math.min(this.screenHeight, newY));
    cursor.lastUpdate = performance.now();

    const movement = Math.abs(dx) + Math.abs(dy);
    cursor.totalMovement = (cursor.totalMovement || 0) + movement;

    if (cursor.totalMovement > 10) {
      cursor.hasMovedOnce = true;
    }

    if (cursorId === this.lastActiveDevice) {
      const currentType = this.cursorTypeDetector.getCurrentCursorType();
      if (cursor.cursorType !== currentType) {
        cursor.cursorType = currentType;
        cursor.cursorCSS = this.cursorTypeDetector.getCursorCSS();
        cursor.cursorFile = this.cursorTypeDetector.getCursorFile();
      }
    }

    this.lastActiveDevice = cursorId;

    if (this.config.highPerformanceMode && cursorId === this.lastActiveDevice) {
      this.syncSystemCursorToHTML(cursor);
    }

    this.sendInstantCursorUpdate(cursor);
  }

  sendInstantCursorUpdate(cursor) {
    if (cursor.hasMovedOnce && this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('cursor-position-update', {
        deviceId: cursor.id,
        x: cursor.x,
        y: cursor.y,
        cursorType: cursor.cursorType,
        cursorCSS: cursor.cursorCSS,
        cursorFile: cursor.cursorFile,
        timestamp: performance.now(),
        isActive: cursor.id === this.lastActiveDevice,
      });
    }
  }

  maintainSystemCursorCenter() {
    if (!this.keepSystemCursorCentered) return;

    try {
      if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
        let currentPos = null;
        try {
          if (this.mouseDetector.rawInputModule.getSystemCursorPos) {
            currentPos = this.mouseDetector.rawInputModule.getSystemCursorPos();
          } else {
            currentPos = screen.getCursorScreenPoint();
          }
        } catch (err) {
          try {
            currentPos = screen.getCursorScreenPoint();
          } catch (err2) {
            return;
          }
        }

        if (currentPos) {
          const centerDistanceX = Math.abs(currentPos.x - this.centerX);
          const centerDistanceY = Math.abs(currentPos.y - this.centerY);
          const threshold = 50;

          if (centerDistanceX > threshold || centerDistanceY > threshold) {
            this.mouseDetector.rawInputModule.setSystemCursorPos(this.centerX, this.centerY);
          }
        }
      }
    } catch (error) {}
  }

  moveSystemCursorToLastActive() {
    if (!this.lastActiveDevice || !this.cursors.has(this.lastActiveDevice)) {
      return;
    }

    const cursor = this.cursors.get(this.lastActiveDevice);
    const systemCoords = this.convertHTMLToSystemCoordinates(cursor.x, cursor.y);
    const targetX = Math.round(systemCoords.x);
    const targetY = Math.round(systemCoords.y);

    try {
      if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
        let realPosBefore = null;
        try {
          if (this.mouseDetector.rawInputModule.getSystemCursorPos) {
            realPosBefore = this.mouseDetector.rawInputModule.getSystemCursorPos();
          }
        } catch (err) {}

        if (!realPosBefore) {
          try {
            realPosBefore = screen.getCursorScreenPoint();
          } catch (err) {}
        }

        let realPosBeforeHTML = null;
        if (realPosBefore) {
          realPosBeforeHTML = this.convertSystemToHTMLCoordinates(realPosBefore.x, realPosBefore.y);
        }

        const success = this.mouseDetector.rawInputModule.setSystemCursorPos(targetX, targetY);
        if (success) {
          let realPosAfter = null;
          try {
            if (this.mouseDetector.rawInputModule.getSystemCursorPos) {
              realPosAfter = this.mouseDetector.rawInputModule.getSystemCursorPos();
            }
          } catch (err) {}

          if (!realPosAfter) {
            try {
              realPosAfter = screen.getCursorScreenPoint();
            } catch (err) {}
          }

          if (realPosAfter) {
            this.analyzeCoordinateAccuracy({ x: targetX, y: targetY }, realPosAfter);

            if (Math.abs(realPosAfter.x - targetX) > 5 || Math.abs(realPosAfter.y - targetY) > 5) {
              const htmlPos = this.convertSystemToHTMLCoordinates(realPosAfter.x, realPosAfter.y);
              cursor.x = htmlPos.x;
              cursor.y = htmlPos.y;
            }
          }
        }
      }
    } catch (error) {}
  }

  getStableColorIndex(deviceId) {
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      const char = deviceId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash) % this.config.cursorColors.length;
  }

  removeCursor(deviceId) {
    if (this.cursors.has(deviceId)) {
      this.cursors.delete(deviceId);

      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('cursor-removed', deviceId);
      }

      if (this.lastActiveDevice === deviceId) {
        const remainingCursors = Array.from(this.cursors.keys());
        this.lastActiveDevice = remainingCursors.length > 0 ? remainingCursors[0] : null;
      }

      this.updateDeviceDisplay();
    }
  }

  updateDeviceDisplay() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('devices-updated', {
        count: this.mouseDetector.getDeviceCount(),
        devices: this.mouseDetector.getConnectedDevices(),
      });
    }
  }

  setupGlobalShortcuts() {
    globalShortcut.register('CommandOrControl+Shift+=', () => {
      this.increaseSensitivity();
    });

    globalShortcut.register('CommandOrControl+Shift+-', () => {
      this.decreaseSensitivity();
    });

    globalShortcut.register('CommandOrControl+Shift+M', () => {
      const testCursors = Array.from(this.cursors.keys()).filter((id) => id.startsWith('test_mouse_'));
      if (testCursors.length > 0) {
        this.simulateCursorMovement(testCursors[0], 50, 30);
      }
    });

    globalShortcut.register('CommandOrControl+Alt+M', () => {
      const testCursors = Array.from(this.cursors.keys()).filter((id) => id.startsWith('test_mouse_'));
      if (testCursors.length > 1) {
        this.simulateCursorMovement(testCursors[1], -30, 40);
      }
    });
  }

  toggleCenterMode() {
    this.keepSystemCursorCentered = !this.keepSystemCursorCentered;
  }

  addTestMouse() {
    clearTestMice();
  }

  showDeviceInfo() {}

  clearTestMice() {
    this.mouseDetector.cleanupInactiveDevices();
  }

  createOverlayWindow() {
    this.overlayWindow = new BrowserWindow({
      fullscreen: true,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: false,
      },
    });

    this.overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

    this.overlayWindow.once('ready-to-show', () => {
      this.overlayWindow.show();
      this.overlayWindow.setIgnoreMouseEvents(true);
    });

    this.overlayWindow.on('closed', () => {
      this.overlayWindow = null;
    });

    if (process.platform === 'win32') {
      this.overlayWindow.setSkipTaskbar(true);
    }
  }

  setupIPC() {
    ipcMain.handle('get-config', () => {
      return this.config;
    });

    ipcMain.handle('get-device-count', () => {
      return this.mouseDetector.getDeviceCount();
    });

    ipcMain.on('mouse-move', (event, mouseData) => {
      this.handleMouseMove(mouseData);
    });

    ipcMain.handle('increase-sensitivity', () => {
      this.increaseSensitivity();
      return this.config.sensitivity;
    });

    ipcMain.handle('decrease-sensitivity', () => {
      this.decreaseSensitivity();
      return this.config.sensitivity;
    });

    ipcMain.handle('reset-sensitivity', () => {
      this.resetSensitivity();
      return this.config.sensitivity;
    });
  }

  increaseSensitivity() {
    this.config.sensitivity = Math.min(5.0, this.config.sensitivity + 0.1);
    this.sendConfigUpdate();
  }

  decreaseSensitivity() {
    this.config.sensitivity = Math.max(0.1, this.config.sensitivity - 0.1);
    this.sendConfigUpdate();
  }

  resetSensitivity() {
    this.config.sensitivity = DEFAULT_CONFIG.sensitivity;
    this.sendConfigUpdate();
  }

  sendConfigUpdate() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('config-updated', this.config);
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(configData);
        this.config = { ...DEFAULT_CONFIG, ...loadedConfig };
      } else {
        this.saveConfig();
      }
    } catch (error) {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {}
  }

  shutdown() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    if (this.renderRequestId) {
      clearImmediate(this.renderRequestId);
    }

    if (this.highPrecisionTimer) {
      clearTimeout(this.highPrecisionTimer);
    }

    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    if (this.mouseDetector) {
      this.mouseDetector.stop();
    }

    if (this.cursorTypeDetector) {
      this.cursorTypeDetector.stop();
    }

    globalShortcut.unregisterAll();
    this.saveConfig();
    app.quit();
  }

  simulateCursorMovement(deviceId, dx, dy) {
    if (this.cursors.has(deviceId)) {
      const cursor = this.cursors.get(deviceId);
      const newX = cursor.x + dx;
      const newY = cursor.y + dy;

      cursor.x = Math.max(0, Math.min(this.screenWidth, newX));
      cursor.y = Math.max(0, Math.min(this.screenHeight, newY));

      this.sendInstantCursorUpdate(cursor);
    }
  }
}

const multimouseApp = new MultimouseApp();

process.on('uncaughtException', (error) => {
  multimouseApp.shutdown();
});

process.on('unhandledRejection', (reason) => {});


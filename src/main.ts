import { exec } from 'child_process';
import * as chokidar from 'chokidar';
import { app, BrowserWindow, Display, globalShortcut, ipcMain, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { CursorTypeDetector } from './cursor_type_detector';
import { RawInputMouseDetector } from './raw_input_detector';
import { AppConfig, CursorData, MouseDevice, MouseMoveData } from './types';

if (process.platform === 'win32') {
  exec('chcp 65001');
}

const DEFAULT_CONFIG: AppConfig = {
  sensitivity: 1.5,
  refreshRate: 1,
  maxCursors: 4,
  cursorSize: 20,
  cursorColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
  highPerformanceMode: true,
  precisePositioning: true,
};

interface CursorState {
  id: string;
  deviceName: string;
  deviceHandle: string | number;
  x: number;
  y: number;
  color: string;
  lastUpdate: number;
  isRawInput: boolean;
  cursorType: string;
  cursorCSS: string;
  cursorFile: string;
  hasMovedOnce: boolean;
  totalMovement: number;
}

class MultimouseApp {
  private overlayWindow: BrowserWindow | null = null;
  private config: AppConfig = { ...DEFAULT_CONFIG };
  private configPath: string;
  private cursors: Map<string, CursorState> = new Map();
  private isShuttingDown: boolean = false;
  private lastActiveDevice: string | null = null;

  private screenWidth: number = 800;
  private screenHeight: number = 600;
  private fullScreenWidth?: number;
  private fullScreenHeight?: number;
  private centerX: number;
  private centerY: number;
  private keepSystemCursorCentered: boolean = true;
  private systemCursorLocked: boolean = false;

  private lastRenderTime: number = 0;
  private targetFPS: number = 1000;
  private frameInterval: number;
  private renderRequestId: NodeJS.Immediate | null = null;
  private highPrecisionTimer: NodeJS.Timeout | null = null;

  private lastSystemCursorPos: { x: number; y: number } = { x: 0, y: 0 };
  private systemCursorUpdatePending: boolean = false;

  private lastLogTime: number = 0;
  private logThrottle: number = 2000;

  private calibrationRatioX: number = 1.0;
  private calibrationRatioY: number = 1.0;
  private correctionFactorX: number = 1.0;
  private correctionFactorY: number = 1.0;

  private mouseDetector: RawInputMouseDetector;
  private cursorTypeDetector: CursorTypeDetector;
  private fileWatcher?: chokidar.FSWatcher;

  constructor() {
    this.configPath = path.join(__dirname, '..', 'config.json');
    this.centerX = this.screenWidth / 2;
    this.centerY = this.screenHeight / 2;
    this.frameInterval = 1000 / this.targetFPS;

    this.mouseDetector = new RawInputMouseDetector();
    this.cursorTypeDetector = new CursorTypeDetector();

    this.setupMouseEvents();
    this.setupCursorTypeEvents();
    this.loadConfig();
    this.setupAppEvents();
    this.setupFileWatcher();
    this.initHighPerformanceLoop();
  }

  private initHighPerformanceLoop(): void {
    if (this.config.highPerformanceMode) {
      this.startHighPrecisionRendering();
    }
  }

  private startHighPrecisionRendering(): void {
    const render = (): void => {
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

  private updateCursorPositionsHighPrecision(): void {
    if (this.lastActiveDevice && this.cursors.has(this.lastActiveDevice)) {
      const cursor = this.cursors.get(this.lastActiveDevice)!;
      this.syncSystemCursorToHTML(cursor);
    }

    this.updateOverlayInstantly();
  }

  private syncSystemCursorToHTML(cursor: CursorState): void {
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

  private updateOverlayInstantly(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      const activeCursors = Array.from(this.cursors.values())
        .filter((c) => c.hasMovedOnce)
        .map(
          (c): CursorData => ({
            deviceId: c.id,
            x: c.x,
            y: c.y,
            color: c.color,
            cursorType: c.cursorType,
            cursorCSS: c.cursorCSS,
            cursorFile: c.cursorFile,
            isVisible: true,
          }),
        );

      const now = Date.now();
      if (activeCursors.length > 0 && now - this.lastLogTime > this.logThrottle) {
        this.lastLogTime = now;
      }

      this.overlayWindow.webContents.send('cursors-instant-update', {
        cursors: activeCursors,
        lastActiveDevice: this.lastActiveDevice,
        timestamp: performance.now(),
      });
    }
  }

  private setupFileWatcher(): void {
    const filesToWatch = [path.join(__dirname, '..', 'overlay.css'), path.join(__dirname, '..', 'overlay.html'), path.join(__dirname, 'renderer.js')];

    this.fileWatcher = chokidar.watch(filesToWatch, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
    });

    this.fileWatcher.on('change', (filePath: string) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.reload();
      }
    });
  }

  private setupMouseEvents(): void {
    this.mouseDetector.on('deviceAdded', () => {
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('deviceRemoved', (device: MouseDevice) => {
      this.removeCursor(device.id);
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('mouseMove', (data: MouseMoveData) => {
      this.handleMouseMove(data);
    });

    this.mouseDetector.on('started', () => {});
    this.mouseDetector.on('stopped', () => {});
  }

  private setupCursorTypeEvents(): void {
    this.cursorTypeDetector.onCursorChange((newType: string) => {
      if (this.lastActiveDevice && this.cursors.has(this.lastActiveDevice)) {
        const cursor = this.cursors.get(this.lastActiveDevice)!;
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

  private setupAppEvents(): void {
    app.whenReady().then(() => {
      const primaryDisplay: Display = screen.getPrimaryDisplay();
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

  private updateScreenDimensions(): void {
    const primaryDisplay: Display = screen.getPrimaryDisplay();
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

  private async calibrateCoordinateMapping(): Promise<void> {
    try {
      let currentSystemPos: { x: number; y: number } | null = null;
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

  private convertHTMLToSystemCoordinates(htmlX: number, htmlY: number): { x: number; y: number } {
    return {
      x: htmlX * 1.25,
      y: htmlY * 1.25,
    };
  }

  private analyzeCoordinateAccuracy(htmlPos: { x: number; y: number }, systemPos: { x: number; y: number }): void {
    if (!htmlPos || !systemPos) return;
    const deltaX = Math.abs(systemPos.x - htmlPos.x);
    const deltaY = Math.abs(systemPos.y - htmlPos.y);
    if (deltaX > 2 || deltaY > 2) {
    }
  }

  private convertSystemToHTMLCoordinates(systemX: number, systemY: number): { x: number; y: number } {
    return {
      x: systemX,
      y: systemY,
    };
  }

  private startMouseInput(): void {
    const success = this.mouseDetector.start();

    if (success) {
      this.centerSystemCursor();
    }

    this.cursorTypeDetector.start();
  }

  private centerSystemCursor(): void {
    if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
      this.mouseDetector.rawInputModule.setSystemCursorPos(this.centerX, this.centerY);
    }
  }

  private handleMouseMove(mouseData: MouseMoveData): void {
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

  private sendInstantCursorUpdate(cursor: CursorState): void {
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

  private getStableColorIndex(deviceId: string): number {
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      const char = deviceId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash) % this.config.cursorColors.length;
  }

  private removeCursor(deviceId: string): void {
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

  private updateDeviceDisplay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('devices-updated', {
        count: this.mouseDetector.getDeviceCount(),
        devices: this.mouseDetector.getConnectedDevices(),
      });
    }
  }

  private setupGlobalShortcuts(): void {
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

  private toggleCenterMode(): void {
    this.keepSystemCursorCentered = !this.keepSystemCursorCentered;
  }

  private addTestMouse(): void {
    this.clearTestMice();
  }

  private showDeviceInfo(): void {}

  private clearTestMice(): void {
    this.mouseDetector.cleanupInactiveDevices();
  }

  private createOverlayWindow(): void {
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
      },
    });

    this.overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));

    this.overlayWindow.once('ready-to-show', () => {
      this.overlayWindow!.show();
      this.overlayWindow!.setIgnoreMouseEvents(true);
    });

    this.overlayWindow.on('closed', () => {
      this.overlayWindow = null;
    });

    if (process.platform === 'win32') {
      this.overlayWindow.setSkipTaskbar(true);
    }
  }

  private setupIPC(): void {
    ipcMain.handle('get-config', () => {
      return this.config;
    });

    ipcMain.handle('get-device-count', () => {
      return this.mouseDetector.getDeviceCount();
    });

    ipcMain.on('mouse-move', (event, mouseData: MouseMoveData) => {
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

  private increaseSensitivity(): void {
    this.config.sensitivity = Math.min(5.0, this.config.sensitivity + 0.1);
    this.sendConfigUpdate();
  }

  private decreaseSensitivity(): void {
    this.config.sensitivity = Math.max(0.1, this.config.sensitivity - 0.1);
    this.sendConfigUpdate();
  }

  private resetSensitivity(): void {
    this.config.sensitivity = DEFAULT_CONFIG.sensitivity;
    this.sendConfigUpdate();
  }

  private sendConfigUpdate(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('config-updated', this.config);
    }
  }

  private loadConfig(): void {
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

  private saveConfig(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  public shutdown(): void {
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

  private simulateCursorMovement(deviceId: string, dx: number, dy: number): void {
    if (this.cursors.has(deviceId)) {
      const cursor = this.cursors.get(deviceId)!;
      const newX = cursor.x + dx;
      const newY = cursor.y + dy;

      cursor.x = Math.max(0, Math.min(this.screenWidth, newX));
      cursor.y = Math.max(0, Math.min(this.screenHeight, newY));

      this.sendInstantCursorUpdate(cursor);
    }
  }
}

const multimouseApp = new MultimouseApp();

process.on('uncaughtException', (error: Error) => {
  multimouseApp.shutdown();
});

process.on('unhandledRejection', (reason: any) => {});



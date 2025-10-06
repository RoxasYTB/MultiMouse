import { exec } from 'child_process';
import * as chokidar from 'chokidar';
import { app, BrowserWindow, Display, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { CursorTypeDetector } from './cursor_type_detector';
import { RawInputMouseDetector } from './raw_input_detector';
import { AppConfig, MouseDevice, MouseMoveData } from './types';

const addon = require(path.join(__dirname, '..', 'bin', 'win32-x64-116', 'Orionix.node'));

const DEFAULT_CONFIG: AppConfig = {
  sensitivity: 1,
  refreshRate: 1,
  maxCursors: 4,
  cursorSize: 20,
  cursorColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
  highPerformanceMode: false,
  precisePositioning: true,
  allowTrayLeftClick: false,

  colorIdentification: true,
  cursorOpacity: 1.0,
  cursorSpeed: 1.0,
  acceleration: true,
  overlayDebug: false,
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

class OrionixAppElectron {
  private overlayWindows: Map<number, BrowserWindow> = new Map();
  private settingsWindow: BrowserWindow | null = null;
  private config: AppConfig = { ...DEFAULT_CONFIG };
  private configPath: string;
  private cursors: Map<string, CursorState> = new Map();
  private isShuttingDown: boolean = false;
  private lastActiveDevice: string | null = null;

  private displays: Display[] = [];
  private displayBounds: Map<number, { x: number; y: number; width: number; height: number }> = new Map();
  private cachedTotalBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

  private screenWidth: number = 800;
  private screenHeight: number = 600;

  private fullScreenWidth: number = 800;

  private fullScreenHeight: number = 600;
  private centerX: number;
  private centerY: number;

  private calibrationRatioX: number = 1.0;

  private calibrationRatioY: number = 1.0;

  private correctionFactorX: number = 1.0;

  private correctionFactorY: number = 1.0;

  private lastRenderTime: number = 0;
  private targetFPS: number = 60;
  private frameInterval: number;
  private renderRequestId: NodeJS.Immediate | null = null;
  private highPrecisionTimer: NodeJS.Timeout | null = null;

  private lastSystemCursorPos: { x: number; y: number } = { x: 0, y: 0 };
  private systemCursorUpdatePending: boolean = false;

  private lastLogTime: number = 0;
  private logThrottle: number = 2000;

  private mouseDetector: RawInputMouseDetector;
  private cursorTypeDetector: CursorTypeDetector;
  private fileWatcher?: chokidar.FSWatcher;
  private tray: Tray | null = null;

  private allowTrayLeftClick: boolean = false;
  private cursorHidden: boolean = false;
  private periodicExportTimer: NodeJS.Timeout | null = null;
  private settingsIPCInitialized: boolean = false;
  private addonModule: any = null;
  private rawInputAddon: any = null;
  private updateDeviceDisplayTimer: NodeJS.Timeout | null = null;
  private displayScaleFactor: number = 1.5;

  private ownerHandle: number | null = null;
  private pressedButtonsByDevice: Map<number, Set<string>> = new Map();
  private lastHtmlPosByDevice: Map<number, { x: number; y: number }> = new Map();
  private devicePresent: Set<number> = new Set();
  private lockTeleportInterval: NodeJS.Timeout | null = null;
  private lockedPosition: { x: number; y: number } | null = null;
  private buttonDownPosition: Map<number, { x: number; y: number }> = new Map();
  private isDragging: Map<number, boolean> = new Map();

  constructor() {
    this.configPath = path.join(__dirname, '..', 'config.json');
    this.centerX = this.screenWidth / 2;
    this.centerY = this.screenHeight / 2;
    this.frameInterval = 1000 / this.targetFPS;

    this.mouseDetector = new RawInputMouseDetector();
    this.cursorTypeDetector = new CursorTypeDetector();

    try {
      this.addonModule = require(path.join(__dirname, '..', 'bin', 'win32-x64-116', 'Orionix.node'));

      try {
        const shutdownHandlerResult = this.addonModule.setupShutdownHandler();
      } catch (handlerError) {
        console.warn("Impossible d'activer le gestionnaire de fermeture Windows:", handlerError);
      }

      const initialCursorState = this.addonModule.getCursorState();
    } catch (error) {
      console.error('Erreur lors du masquage du curseur système:', error);
      this.cursorHidden = false;
    }

    try {
      this.rawInputAddon = require(path.join(__dirname, '..', 'build', 'Release', 'Orionix_raw_input.node'));
    } catch (error) {
      console.warn('⚠️ Impossible de charger le module Raw Input:', error);
    }

    this.setupMouseEvents();
    this.setupCursorTypeEvents();
    this.loadConfig();

    this.allowTrayLeftClick = !!this.config.allowTrayLeftClick;
    this.setupAppEvents();
    this.setupFileWatcher();
    this.initHighPerformanceLoop();
    this.startPeriodicCursorExport();
  }

  private initHighPerformanceLoop(): void {
    if (this.config.highPerformanceMode) {
      this.startHighPrecisionRendering();
    }
  }

  private manageSystemCursorVisibility(): void {
    const hasActiveCursors = this.cursors.size > 0;

    if (hasActiveCursors && !this.cursorHidden) {
      try {
        if (!this.addonModule) return;

        const hideResult = this.addonModule.hideSystemCursor();
        this.cursorHidden = hideResult || false;
      } catch (error) {
        console.error('Erreur masquage curseur:', error);
      }
    } else if (!hasActiveCursors && this.cursorHidden) {
      try {
        if (!this.addonModule) return;

        const showResult = this.addonModule.showSystemCursor();
        if (showResult) {
          this.cursorHidden = false;
        }
      } catch (error) {
        console.error('Erreur restauration curseur:', error);
      }
    }
  }

  private startHighPrecisionRendering(): void {
    const render = (): void => {
      const now = performance.now();
      if (now - this.lastRenderTime >= this.frameInterval) {
        this.lastRenderTime = now;

        if (this.lastActiveDevice && this.cursors.has(this.lastActiveDevice)) {
          const cursor = this.cursors.get(this.lastActiveDevice)!;
          this.syncSystemCursorToHTML(cursor);
        }
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
    if (this.ownerHandle !== null && cursor.deviceHandle !== this.ownerHandle) {
      return;
    }

    if (!this.systemCursorUpdatePending) {
      this.systemCursorUpdatePending = true;
      setImmediate(() => {
        const clamped = this.applySmartBounds(cursor.x, cursor.y, cursor.x, cursor.y);
        const clampedX = clamped.x;
        const clampedY = clamped.y;

        const physicalX = Math.round(clampedX * this.displayScaleFactor);
        const physicalY = Math.round(clampedY * this.displayScaleFactor);

        if (Math.abs(this.lastSystemCursorPos.x - physicalX) > 0 || Math.abs(this.lastSystemCursorPos.y - physicalY) > 0) {
          if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
            this.mouseDetector.rawInputModule.setSystemCursorPos(physicalX, physicalY);
            this.lastSystemCursorPos = { x: physicalX, y: physicalY };
          }
        }

        this.systemCursorUpdatePending = false;
      });
    }
  }

  private updateOverlayInstantly(): void {
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

    this.sendToAllOverlays('cursors-instant-update', {
      cursors: activeCursors,
      lastActiveDevice: this.lastActiveDevice,
      timestamp: performance.now(),
    });
  }

  private setupFileWatcher(): void {
    const filesToWatch = [path.join(__dirname, '..', 'overlay.css'), path.join(__dirname, '..', 'overlay.html'), path.join(__dirname, 'renderer.js'), path.join(__dirname, '..', 'cursorsToUse.json')];

    this.fileWatcher = chokidar.watch(filesToWatch, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.fileWatcher.on('change', (filePath: string) => {
      if (filePath.endsWith('cursorsToUse.json')) {
        this.sendToAllOverlays('cursors-config-changed', {});

        this.cursors.forEach((cursor, deviceId) => {
          this.sendToAllOverlays('cursor-updated', cursor);
        });
      }
      this.overlayWindows.forEach((window) => {
        if (window && !window.isDestroyed()) {
          window.webContents.reload();
        }
      });
    });
  }

  private onDeviceButton(event: any): void {
    const dev = event.deviceHandle;
    const actionParts = event.action.split('-');
    if (actionParts.length !== 2) return;

    const btn = actionParts[0];
    const dir = actionParts[1];

    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      const set = this.pressedButtonsByDevice.get(dev) ?? new Set<string>();
      if (dir === 'down') {
        set.add(btn);
      } else if (dir === 'up') {
        set.delete(btn);
      }
      this.pressedButtonsByDevice.set(dev, set);
      return;
    }

    const set = this.pressedButtonsByDevice.get(dev) ?? new Set<string>();
    if (dir === 'down') {
      set.add(btn);
      const pos = this.lastHtmlPosByDevice.get(dev) ?? this.getFallbackSystemPos();
      this.buttonDownPosition.set(dev, { x: pos.x, y: pos.y });
      this.isDragging.set(dev, false);
    } else if (dir === 'up') {
      set.delete(btn);
      this.buttonDownPosition.delete(dev);
      this.isDragging.delete(dev);
    }
    this.pressedButtonsByDevice.set(dev, set);

    if (this.ownerHandle === dev && set.size === 0) {
      this.ownerHandle = null;
      this.lockedPosition = null;
      this.stopLockTeleportLoop();
    }
  }

  private startLockTeleportLoop(): void {
    if (this.lockTeleportInterval) {
      return;
    }

    this.lockTeleportInterval = setInterval(() => {
      if (this.ownerHandle === null || !this.lockedPosition) {
        this.stopLockTeleportLoop();
        return;
      }

      if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
        this.mouseDetector.rawInputModule.setSystemCursorPos(this.lockedPosition.x, this.lockedPosition.y);
      }
    }, 1);
  }

  private stopLockTeleportLoop(): void {
    if (this.lockTeleportInterval) {
      clearInterval(this.lockTeleportInterval);
      this.lockTeleportInterval = null;
    }
  }

  private onDeviceMove(event: any): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      return;
    }

    const dev = event.deviceHandle;
    this.devicePresent.add(dev);

    const pos = this.lastHtmlPosByDevice.get(dev);
    if (!pos) return;

    const buttonSet = this.pressedButtonsByDevice.get(dev);
    const hasButtonPressed = buttonSet && buttonSet.size > 0;

    if (hasButtonPressed && !this.isDragging.get(dev)) {
      const buttonDownPos = this.buttonDownPosition.get(dev);
      if (buttonDownPos) {
        const distance = Math.sqrt(Math.pow(pos.x - buttonDownPos.x, 2) + Math.pow(pos.y - buttonDownPos.y, 2));

        if (distance > 5) {
          this.isDragging.set(dev, true);

          if (!this.ownerHandle) {
            this.ownerHandle = dev;
            this.lockedPosition = { x: pos.x, y: pos.y };

            if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
              this.mouseDetector.rawInputModule.setSystemCursorPos(this.lockedPosition.x, this.lockedPosition.y);
            }

            this.startLockTeleportLoop();
          }
        }
      }
    }

    if (this.ownerHandle) {
      if (dev === this.ownerHandle) {
        if (this.lockedPosition && this.mouseDetector.rawInputModule?.setSystemCursorPos) {
          this.mouseDetector.rawInputModule.setSystemCursorPos(this.lockedPosition.x, this.lockedPosition.y);
        }
      } else {
      }
    } else {
      if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
        this.mouseDetector.rawInputModule.setSystemCursorPos(pos.x, pos.y);
      }
    }
  }

  private onDeviceRemoval(dev: number): void {
    this.devicePresent.delete(dev);
    this.pressedButtonsByDevice.delete(dev);
    this.lastHtmlPosByDevice.delete(dev);
    this.buttonDownPosition.delete(dev);
    this.isDragging.delete(dev);
    if (this.ownerHandle === dev) {
      this.ownerHandle = null;
      this.lockedPosition = null;
    }
  }

  private getFallbackSystemPos(): { x: number; y: number } {
    if (this.mouseDetector.rawInputModule?.getSystemCursorPos) {
      try {
        return this.mouseDetector.rawInputModule.getSystemCursorPos();
      } catch (e) {}
    }
    return { x: this.centerX, y: this.centerY };
  }

  private setupMouseEvents(): void {
    this.mouseDetector.on('deviceAdded', (device: MouseDevice) => {
      if (device.handle) {
        this.devicePresent.add(device.handle);
      }
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('deviceRemoved', (device: MouseDevice) => {
      this.removeCursor(device.id);
      if (device.handle) {
        this.onDeviceRemoval(device.handle);
      }
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('mouseMove', (data: MouseMoveData) => {
      this.handleMouseMove(data);
    });

    this.mouseDetector.on('mouseButton', (event: any) => {
      this.onDeviceButton(event);
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

      this.sendToAllOverlays('cursor-type-changed', {
        type: newType,
        cssClass: this.cursorTypeDetector.getCursorCSS(newType),
        file: this.cursorTypeDetector.getCursorFile(newType),
        filePath: this.cursorTypeDetector.getCursorFilePath(newType),
        activeDeviceId: this.lastActiveDevice,
      });
    });
  }

  private setupAppEvents(): void {
    app.whenReady().then(async () => {
      const primaryDisplay: Display = screen.getPrimaryDisplay();
      this.screenWidth = primaryDisplay.size.width;
      this.screenHeight = primaryDisplay.size.height;
      this.fullScreenWidth = primaryDisplay.size.width;
      this.fullScreenHeight = primaryDisplay.size.height;
      this.centerX = this.screenWidth / 2;
      this.centerY = this.screenHeight / 2;

      this.displayScaleFactor = primaryDisplay.scaleFactor;

      this.exportCursors().catch((error) => {
        console.warn("Impossible d'exporter les curseurs au démarrage:", error);
      });

      this.calibrateCoordinateMapping();
      this.startMouseInput();
      this.createOverlayWindows();
      this.createTray();
      this.setupIPC();
      this.setupGlobalShortcuts();

      Menu.setApplicationMenu(null);

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
    });
  }

  private updateScreenDimensions(): void {
    const primaryDisplay: Display = screen.getPrimaryDisplay();
    const newWidth = primaryDisplay.size.width;
    const newHeight = primaryDisplay.size.height;
    const newScaleFactor = primaryDisplay.scaleFactor;

    if (this.screenWidth !== newWidth || this.screenHeight !== newHeight || this.displayScaleFactor !== newScaleFactor) {
      this.screenWidth = newWidth;
      this.screenHeight = newHeight;
      this.displayScaleFactor = newScaleFactor;
      this.centerX = this.screenWidth / 2;
      this.centerY = this.screenHeight / 2;

      this.createOverlayWindows();

      this.sendToAllOverlays('screen-dimensions-changed', {
        width: this.screenWidth,
        height: this.screenHeight,
        centerX: this.centerX,
        centerY: this.centerY,
        scaleFactor: this.displayScaleFactor,
      });
    }
  }

  private async calibrateCoordinateMapping(): Promise<void> {
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

  private analyzeCoordinateAccuracy(htmlPos: any, systemPos: any): void {
    if (!htmlPos || !systemPos) return;
    const deltaX = Math.abs(systemPos.x - htmlPos.x);
    const deltaY = Math.abs(systemPos.y - htmlPos.y);
    if (deltaX > 2 || deltaY > 2) {
    }
  }

  private async exportCursors(): Promise<void> {
    try {
      let scriptPath: string;

      if (app.isPackaged) {
        scriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'export-cursors.ps1');
      } else {
        scriptPath = path.join(__dirname, '..', 'export-cursors.ps1');
      }

      if (!fs.existsSync(scriptPath)) {
        console.error(`Script PowerShell introuvable: ${scriptPath}`);
        return;
      }

      const workingDir = path.dirname(scriptPath);

      return new Promise<void>((resolve, reject) => {
        const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;

        exec(
          command,
          {
            cwd: workingDir,
            timeout: 30000,
          },
          (error, stdout, stderr) => {
            if (error) {
              console.error("Erreur lors de l'export des curseurs:", error.message);
              reject(error);
              return;
            }

            if (stderr) {
              console.warn('Avertissements PowerShell:', stderr);
            }

            if (stdout) {
            }

            resolve();
          },
        );
      });
    } catch (error) {
      console.error("Erreur lors de l'export des curseurs:", error);
      throw error;
    }
  }

  private startPeriodicCursorExport(): void {
    this.periodicExportTimer = setInterval(() => {
      this.exportCursors().catch((error) => {
        console.warn("Erreur lors de l'export périodique des curseurs:", error);
      });
    }, 5 * 60 * 1000);
  }

  private startMouseInput(): void {
    try {
      const success = this.mouseDetector.start();

      if (success) {
        this.centerSystemCursor();
      }
    } catch (error) {}

    try {
      this.cursorTypeDetector.start();
    } catch (error) {}
  }

  private createTray(): void {
    try {
      let iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(process.resourcesPath, 'assets', 'icon.ico');
      }

      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(process.resourcesPath, 'app', 'assets', 'icon.ico');
      }

      let trayImage: Electron.NativeImage;
      if (fs.existsSync(iconPath)) {
        trayImage = nativeImage.createFromPath(iconPath);
      } else {
        trayImage = nativeImage.createEmpty();
      }

      this.tray = new Tray(trayImage);
      this.tray.setToolTip('Orionix');
      this.updateTrayMenu();

      this.tray.on('click', () => {
        if (!this.allowTrayLeftClick) {
          return;
        }

        const anyVisible = Array.from(this.overlayWindows.values()).some((window) => window && !window.isDestroyed() && window.isVisible());

        this.overlayWindows.forEach((window) => {
          if (window && !window.isDestroyed()) {
            if (anyVisible) {
              window.hide();
            } else {
              window.show();
            }
          }
        });
      });

      this.tray.on('double-click', () => {
        this.openSettingsWindow();
      });
    } catch (error) {
      console.error('Erreur lors de la création de la tray:', error);
    }
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Paramètres',
        click: () => {
          this.openSettingsWindow();
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Quitter',
        click: () => {
          this.shutdown();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private openSettingsWindow(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return;
    }

    this.createSettingsWindow();
  }

  private createSettingsWindow(): void {
    if (!this.settingsIPCInitialized) {
      this.setupSettingsIPC();
      this.settingsIPCInitialized = true;
    }

    if (this.addonModule && this.cursorHidden) {
      const showResult = this.addonModule.showSystemCursor();
      if (showResult) {
        this.cursorHidden = false;
      }
    }

    if (this.lockTeleportInterval) {
      clearInterval(this.lockTeleportInterval);
      this.lockTeleportInterval = null;
    }
    this.ownerHandle = null;
    this.lockedPosition = null;
    this.pressedButtonsByDevice.clear();
    this.buttonDownPosition.clear();
    this.isDragging.clear();

    this.settingsWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 700,
      frame: true,
      transparent: false,
      alwaysOnTop: false,
      resizable: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
        devTools: true,
      },
      icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
      title: 'Orionix - Paramètres',
    });

    this.settingsWindow.loadFile(path.join(__dirname, '..', 'settingsInterface', 'settings.html'));

    this.settingsWindow.once('ready-to-show', () => {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

      const windowWidth = Math.min(1600, screenWidth - 100);
      const windowHeight = Math.min(1000, screenHeight - 100);

      this.settingsWindow!.setSize(windowWidth, windowHeight);
      this.settingsWindow!.center();
      this.settingsWindow!.show();

      this.settingsWindow!.setMenu(null);

      this.settingsWindow!.webContents.send('settings-config', this.config);
    });

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;

      this.ownerHandle = null;
      this.lockedPosition = null;
      this.pressedButtonsByDevice.clear();
      this.buttonDownPosition.clear();
      this.isDragging.clear();

      if (this.lockTeleportInterval) {
        clearInterval(this.lockTeleportInterval);
        this.lockTeleportInterval = null;
      }

      this.manageSystemCursorVisibility();
    });
  }
  private setupSettingsIPC(): void {
    ipcMain.on('cursor:htmlPos', (event, data: { deviceHandle: number; x: number; y: number }) => {
      this.lastHtmlPosByDevice.set(data.deviceHandle, { x: data.x, y: data.y });
    });

    ipcMain.on('settings-changed', (event, newSettings) => {
      this.updateConfig(newSettings);
    });

    ipcMain.on('get-current-config', (event) => {
      event.reply('current-config', this.config);
    });

    ipcMain.on('close-settings-window', () => {
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        this.settingsWindow.close();
      }
    });

    ipcMain.on('reset-all-settings', (event, defaultSettings) => {
      try {
        fs.writeFileSync(this.configPath, JSON.stringify(defaultSettings, null, 2));

        this.config = { ...defaultSettings };

        this.applySettingsChanges(defaultSettings);

        event.reply('settings-reset-complete', defaultSettings);

        this.sendToAllOverlays('settings-updated', this.config);
      } catch (error) {
        console.error('❌ Erreur lors de la réinitialisation de config.json:', error);
        event.reply('settings-reset-error', error instanceof Error ? error.message : 'Erreur inconnue');
      }
    });

    ipcMain.on('open-external-powershell', (event, url) => {
      try {
        const { spawn } = require('child_process');

        const powershellProcess = spawn('powershell', ['-Command', `Start-Process "${url}"`], {
          shell: true,
          stdio: 'ignore',
          detached: true,
        });

        powershellProcess.unref();
      } catch (error) {
        console.error('❌ Erreur ouverture URL via PowerShell:', error);

        const { shell } = require('electron');
        shell.openExternal(url);
      }
    });

    ipcMain.on('get-system-cursor-size', async (event) => {
      try {
        const { spawn } = require('child_process');

        const powershellCommand = `Get-ItemProperty "HKCU:\\Control Panel\\Cursors" | Select-Object -ExpandProperty CursorBaseSize`;

        const process = spawn('powershell', ['-Command', powershellCommand], {
          shell: true,
          stdio: 'pipe',
        });

        let output = '';
        process.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });

        process.on('close', () => {
          const size = parseInt(output.trim());
          const cursorSize = isNaN(size) ? 32 : size;

          event.reply('system-cursor-size', cursorSize);

          if (cursorSize !== 32) {
            const clampedSize = Math.max(12, Math.min(64, cursorSize));
            this.updateConfig({ cursorSize: clampedSize });
          }
        });

        process.on('error', (error: Error) => {
          console.error('❌ Erreur lors de la récupération de la taille du curseur:', error);
          event.reply('system-cursor-size', 32);
        });
      } catch (error) {
        console.error('❌ Erreur générale lors de la récupération de la taille du curseur:', error);
        event.reply('system-cursor-size', 32);
      }
    });
  }

  private updateConfig(newSettings: Partial<AppConfig>): void {
    this.config = { ...this.config, ...newSettings };

    this.saveConfig();

    this.applySettingsChanges(newSettings);

    this.sendToAllOverlays('settings-updated', this.config);
  }

  private applySettingsChanges(newSettings: Partial<AppConfig>): void {
    if (newSettings.cursorSpeed !== undefined) {
      this.config.sensitivity = newSettings.cursorSpeed;
    }

    if (newSettings.cursorOpacity !== undefined) {
      this.config.cursorOpacity = newSettings.cursorOpacity;
      this.sendToAllOverlays('update-cursor-opacity', newSettings.cursorOpacity);
    }

    if (newSettings.overlayDebug !== undefined) {
      this.config.overlayDebug = newSettings.overlayDebug;
      this.sendToAllOverlays('toggle-debug-mode', newSettings.overlayDebug);
    }

    if (newSettings.colorIdentification !== undefined) {
      this.config.colorIdentification = newSettings.colorIdentification;
      this.sendToAllOverlays('update-color-identification', newSettings.colorIdentification);
    }

    if (newSettings.acceleration !== undefined) {
      this.config.acceleration = newSettings.acceleration;
    }

    this.saveConfig();
  }

  private setupGlobalShortcuts(): void {
    globalShortcut.register('CommandOrControl+Shift+S', () => {
      this.openSettingsWindow();
    });

    globalShortcut.register('CommandOrControl+Shift+D', () => {
      this.config.overlayDebug = !this.config.overlayDebug;
      this.applySettingsChanges({ overlayDebug: this.config.overlayDebug });
    });
  }

  private centerSystemCursor(): void {
    if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
      this.mouseDetector.rawInputModule.setSystemCursorPos(this.centerX, this.centerY);
    }
  }

  private handleMouseMove(mouseData: MouseMoveData): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      return;
    }

    const cursorId = mouseData.deviceId;
    const deviceName = mouseData.deviceName || 'Device Inconnu';
    const isRawInput = mouseData.isRawInput || false;
    const deviceHandle = mouseData.deviceHandle;
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
        deviceHandle: deviceHandle || 0,
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
      this.manageSystemCursorVisibility();
    }

    const scaledDx = dx / this.displayScaleFactor;
    const scaledDy = dy / this.displayScaleFactor;

    let newX = cursor.x + scaledDx * this.config.sensitivity;
    let newY = cursor.y + scaledDy * this.config.sensitivity;

    const beforeClampX = newX;
    const beforeClampY = newY;

    const clamped = this.applySmartBounds(newX, newY, cursor.x, cursor.y);
    newX = clamped.x;
    newY = clamped.y;

    if (beforeClampX !== newX || beforeClampY !== newY) {
      const now = performance.now();
      if (now - this.lastLogTime > this.logThrottle) {
        this.lastLogTime = now;
      }
    }

    cursor.x = newX;
    cursor.y = newY;
    cursor.lastUpdate = performance.now();

    if (this.ownerHandle !== null && typeof deviceHandle === 'number' && deviceHandle === this.ownerHandle) {
      const physicalX = Math.round(newX * this.displayScaleFactor);
      const physicalY = Math.round(newY * this.displayScaleFactor);
      this.lockedPosition = { x: physicalX, y: physicalY };
    }

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

    if (typeof mouseData.deviceHandle === 'number') {
      this.onDeviceMove({
        deviceHandle: mouseData.deviceHandle,
        type: 'move',
      });
    }

    this.sendInstantCursorUpdate(cursor);
  }

  sendInstantCursorUpdate(cursor: CursorState): void {
    if (cursor.hasMovedOnce) {
      this.sendToAllOverlays('cursor-position-update', {
        deviceId: cursor.id,
        x: cursor.x,
        y: cursor.y,
        cursorType: cursor.cursorType,
        cursorCSS: cursor.cursorCSS,
        cursorFile: cursor.cursorFile,
        isActive: cursor.id === this.lastActiveDevice,
        isVisible: true,
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
      const cursor = this.cursors.get(deviceId)!;

      this.cursors.delete(deviceId);
      this.manageSystemCursorVisibility();

      this.sendToAllOverlays('cursor-removed', deviceId);

      if (this.lastActiveDevice === deviceId) {
        const remainingCursors = Array.from(this.cursors.keys());
        this.lastActiveDevice = remainingCursors.length > 0 ? remainingCursors[0] : null;
      }

      this.updateDeviceDisplay();
    } else {
    }
  }

  private updateDeviceDisplay(): void {
    if (this.updateDeviceDisplayTimer) {
      clearTimeout(this.updateDeviceDisplayTimer);
    }

    this.updateDeviceDisplayTimer = setTimeout(() => {
      const deviceData = {
        count: this.mouseDetector.getDeviceCount(),
        devices: this.mouseDetector.getConnectedDevices(),
      };

      this.overlayWindows.forEach((window) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('devices-updated', deviceData);
        }
      });
    }, 16);
  }

  private sendToAllOverlays(channel: string, data: any): void {
    this.overlayWindows.forEach((window) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
  }

  private createOverlayWindows(): void {
    this.closeAllOverlays();

    this.displays = screen.getAllDisplays();
    this.displayBounds.clear();
    this.cachedTotalBounds = null;

    this.analyzeDisplayConfiguration();

    const totalBounds = this.calculateTotalScreenBounds();
    console.log(`🎯 Bounds totaux calculés:`, {
      minX: totalBounds.minX,
      minY: totalBounds.minY,
      maxX: totalBounds.maxX,
      maxY: totalBounds.maxY,
      width: totalBounds.maxX - totalBounds.minX,
      height: totalBounds.maxY - totalBounds.minY,
    });

    this.displays.forEach((display, index) => {
      console.log(`Creation overlay pour ecran ${index + 1}:`, {
        id: display.id,
        bounds: display.bounds,
        size: display.size,
      });

      this.displayBounds.set(display.id, {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      });

      const overlayWindow = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        fullscreen: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false,
          devTools: true,
        },
      });

      overlayWindow.setAlwaysOnTop(true, 'screen-saver');

      if (process.platform === 'win32') {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

        const hwnd = overlayWindow.getNativeWindowHandle();
        if (hwnd && this.rawInputAddon) {
          try {
            if (this.rawInputAddon.setWindowTopMost) {
              const success = this.rawInputAddon.setWindowTopMost(hwnd);
              if (success) {
                setInterval(() => {
                  if (this.rawInputAddon && this.rawInputAddon.keepWindowTopMost && hwnd) {
                    this.rawInputAddon.keepWindowTopMost(hwnd);
                  }
                }, 500);
              } else {
              }
            } else {
            }
          } catch (err) {}
        }
      } else {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      }

      const overlayUrl = `file://${path.join(__dirname, '..', 'overlay.html')}?displayIndex=${index}&displayId=${display.id}&offsetX=${display.bounds.x}&offsetY=${display.bounds.y}&scaleFactor=${display.scaleFactor}`;
      overlayWindow.loadURL(overlayUrl);

      overlayWindow.once('ready-to-show', () => {
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true);

        overlayWindow.webContents.send('screen-info', {
          displayId: display.id,
          bounds: display.bounds,
          size: display.size,
          isPrimary: display.id === screen.getPrimaryDisplay().id,
          displayIndex: index,
          offsetX: display.bounds.x,
          offsetY: display.bounds.y,
          scaleFactor: display.scaleFactor,
        });

        if (index === 0) {
          this.sendExistingCursorsToRenderer();
        }
      });

      overlayWindow.on('closed', () => {
        this.overlayWindows.delete(display.id);
        this.displayBounds.delete(display.id);
      });

      overlayWindow.on('close', (e) => {
        if (index === 0) {
          this.shutdown();
        }
      });

      this.overlayWindows.set(display.id, overlayWindow);
    });
  }

  private closeAllOverlays(): void {
    this.overlayWindows.forEach((window) => {
      if (window && !window.isDestroyed()) {
        window.close();
      }
    });
    this.overlayWindows.clear();
    this.displayBounds.clear();
  }

  private analyzeDisplayConfiguration(): void {
    if (this.displays.length < 2) {
      return;
    }

    const sortedDisplays = [...this.displays].sort((a, b) => a.bounds.x - b.bounds.x);

    sortedDisplays.forEach((display, index) => {
      const isLeft = index === 0;
      const isRight = index === sortedDisplays.length - 1;

      console.log(`📺 Écran ${index + 1}:`, {
        id: display.id,
        position: `${display.bounds.x}, ${display.bounds.y}`,
        size: `${display.bounds.width}x${display.bounds.height}`,
        role: isLeft ? 'gauche' : isRight ? 'droite' : 'centre',
      });
    });
  }

  private calculateTotalScreenBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    if (this.cachedTotalBounds) {
      return this.cachedTotalBounds;
    }

    if (this.displays.length === 0) {
      this.cachedTotalBounds = {
        minX: 0,
        maxX: this.screenWidth,
        minY: 0,
        maxY: this.screenHeight,
      };
      return this.cachedTotalBounds;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    this.displays.forEach((display, index) => {
      const bounds = display.bounds;
      const right = bounds.x + bounds.width;
      const bottom = bounds.y + bounds.height;

      minX = Math.min(minX, bounds.x);
      maxX = Math.max(maxX, right);

      minY = Math.min(minY, bounds.y);
      maxY = Math.max(maxY, bottom);
    });

    this.cachedTotalBounds = { minX, maxX, minY, maxY };
    return this.cachedTotalBounds;
  }

  private getDisplayBoundsById(displayId: number): { x: number; y: number; width: number; height: number } | null {
    return this.displayBounds.get(displayId) || null;
  }

  private getDisplayForPosition(x: number, y: number): number | null {
    for (const [displayId, bounds] of this.displayBounds.entries()) {
      if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
        return displayId;
      }
    }
    return null;
  }

  private applySmartBounds(newX: number, newY: number, currentX: number, currentY: number): { x: number; y: number } {
    const bounds = this.calculateTotalScreenBounds();

    newX = Math.max(bounds.minX, Math.min(newX, bounds.maxX));
    newY = Math.max(bounds.minY, Math.min(newY, bounds.maxY));

    const currentDisplayId = this.getDisplayForPosition(newX, newY);
    if (currentDisplayId === null) {
      const fallbackDisplayId = this.getDisplayForPosition(currentX, currentY);
      if (fallbackDisplayId !== null) {
        const displayBounds = this.getDisplayBoundsById(fallbackDisplayId);
        if (displayBounds) {
          newY = Math.max(displayBounds.y, Math.min(newY, displayBounds.y + displayBounds.height));
        }
      }
      return { x: newX, y: newY };
    }

    const displayBounds = this.getDisplayBoundsById(currentDisplayId);
    if (!displayBounds) {
      return { x: newX, y: newY };
    }

    const horizontalNeighbors: number[] = [];
    const verticalNeighbors: number[] = [];

    for (const [otherId, otherBounds] of this.displayBounds.entries()) {
      if (otherId === currentDisplayId) continue;

      const isHorizontalNeighbor = (Math.abs(otherBounds.x + otherBounds.width - displayBounds.x) < 10 || Math.abs(otherBounds.x - (displayBounds.x + displayBounds.width)) < 10) && !(otherBounds.y + otherBounds.height <= displayBounds.y || otherBounds.y >= displayBounds.y + displayBounds.height);

      const isVerticalNeighbor = (Math.abs(otherBounds.y + otherBounds.height - displayBounds.y) < 10 || Math.abs(otherBounds.y - (displayBounds.y + displayBounds.height)) < 10) && !(otherBounds.x + otherBounds.width <= displayBounds.x || otherBounds.x >= displayBounds.x + displayBounds.width);

      if (isHorizontalNeighbor) horizontalNeighbors.push(otherId);
      if (isVerticalNeighbor) verticalNeighbors.push(otherId);
    }

    if (horizontalNeighbors.length > 0 && verticalNeighbors.length === 0) {
      newY = Math.max(displayBounds.y, Math.min(newY, displayBounds.y + displayBounds.height));
    } else if (verticalNeighbors.length > 0 && horizontalNeighbors.length === 0) {
      newX = Math.max(displayBounds.x, Math.min(newX, displayBounds.x + displayBounds.width));
    } else if (horizontalNeighbors.length > 0 && verticalNeighbors.length > 0) {
      newX = Math.max(displayBounds.x, Math.min(newX, displayBounds.x + displayBounds.width));
      newY = Math.max(displayBounds.y, Math.min(newY, displayBounds.y + displayBounds.height));
    } else {
      newX = Math.max(displayBounds.x, Math.min(newX, displayBounds.x + displayBounds.width));
      newY = Math.max(displayBounds.y, Math.min(newY, displayBounds.y + displayBounds.height));
    }

    return { x: newX, y: newY };
  }

  private sendCursorToSpecificDisplay(cursor: CursorState, targetDisplayId: number): void {
    const targetWindow = this.overlayWindows.get(targetDisplayId);
    if (targetWindow && !targetWindow.isDestroyed()) {
      const displayBounds = this.displayBounds.get(targetDisplayId);
      if (displayBounds) {
        const localX = cursor.x - displayBounds.x;
        const localY = cursor.y - displayBounds.y;

        targetWindow.webContents.send('cursor-position-update', {
          deviceId: cursor.id,
          x: localX,
          y: localY,
          cursorType: cursor.cursorType,
          cursorCSS: cursor.cursorCSS,
          cursorFile: cursor.cursorFile,
          timestamp: performance.now(),
          isActive: cursor.id === this.lastActiveDevice,
        });
      }
    }
  }

  private sendExistingCursorsToRenderer(): void {
    const existingCursors = Array.from(this.cursors.values()).map((cursor) => ({
      deviceId: cursor.id,
      x: cursor.x,
      y: cursor.y,
      color: cursor.color,
      cursorType: cursor.cursorType,
      cursorCSS: cursor.cursorCSS,
      cursorFile: cursor.cursorFile,
      isVisible: true,
    }));

    if (existingCursors.length > 0) {
      this.sendToAllOverlays('cursors-instant-update', {
        cursors: existingCursors,
        lastActiveDevice: this.lastActiveDevice,
        timestamp: performance.now(),
      });
    }
  }

  private setupIPC(): void {
    ipcMain.handle('get-config', () => {
      return this.config;
    });

    ipcMain.handle('get-device-count', () => {
      return this.mouseDetector.getDeviceCount();
    });

    ipcMain.on('mouse-move', (_event, mouseData: MouseMoveData) => {
      this.handleMouseMove(mouseData);
    });

    ipcMain.on('renderer-ready', () => {
      this.sendExistingCursorsToRenderer();
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

    ipcMain.handle('force-scan-devices', () => {
      return { success: true, message: 'Surveillance USB automatique active' };
    });

    ipcMain.handle('get-monitored-devices', () => {
      const devices = this.mouseDetector.getMonitoredDevices();

      return devices;
    });

    ipcMain.handle('get-active-cursors', () => {
      const cursors = Array.from(this.cursors.values());

      return cursors.map((cursor) => ({
        id: cursor.id,
        deviceName: cursor.deviceName,
        x: cursor.x,
        y: cursor.y,
        lastUpdate: cursor.lastUpdate,
        hasMovedOnce: cursor.hasMovedOnce,
        totalMovement: cursor.totalMovement,
      }));
    });

    ipcMain.handle('clear-disconnected-cursors', () => {
      const clearedCount = this.clearDisconnectedCursors();
      return { success: true, clearedCount, message: `${clearedCount} curseurs nettoyés` };
    });

    ipcMain.handle('simulate-device-disconnect', (_, deviceId: string) => {
      this.simulateDeviceDisconnect(deviceId);
      return { success: true, message: `Déconnexion simulée pour ${deviceId}` };
    });

    ipcMain.handle('reset-config', () => {
      return this.resetConfig();
    });

    ipcMain.handle('reset-to-defaults', () => {
      return this.resetToDefaults();
    });

    ipcMain.handle('get-system-cursor-size', async () => {
      return await this.getSystemCursorSize();
    });

    ipcMain.on('get-system-cursor-size', async (event) => {
      const size = await this.getSystemCursorSize();
      event.reply('system-cursor-size', size);
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
    this.sendToAllOverlays('config-updated', this.config);
  }

  private resetConfig(): { success: boolean; message: string } {
    try {
      this.config = { ...DEFAULT_CONFIG };

      this.saveConfig();

      this.sendToAllOverlays('config-updated', this.config);

      return { success: true, message: 'Configuration réinitialisée avec succès' };
    } catch (error) {
      console.error('Erreur lors de la réinitialisation:', error);
      return { success: false, message: 'Erreur lors de la réinitialisation' };
    }
  }

  private resetToDefaults(): { success: boolean; message: string; config: AppConfig } {
    const result = this.resetConfig();
    return {
      ...result,
      config: this.config,
    };
  }

  private async getSystemCursorSize(): Promise<number> {
    try {
      if (process.platform === 'win32') {
        const { exec } = require('child_process');

        return new Promise<number>((resolve) => {
          exec('powershell -Command "try { $reg = Get-ItemProperty -Path \\"HKCU:\\\\Control Panel\\\\Cursors\\" -Name \\"CursorBaseSize\\" -ErrorAction SilentlyContinue; if ($reg) { $reg.CursorBaseSize } else { 32 } } catch { 32 }"', (error: any, stdout: any) => {
            if (error) {
              console.warn('Impossible de détecter la taille système, utilisation par défaut:', error);
              resolve(32);
            } else {
              const detectedSize = parseInt(stdout.toString().trim()) || 32;

              resolve(Math.max(16, Math.min(128, detectedSize)));
            }
          });
        });
      }
      return 32;
    } catch (error) {
      console.error('Erreur lors de la détection de la taille système:', error);
      return 32;
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

  private clearDisconnectedCursors(): number {
    const connectedDevices = this.mouseDetector.getConnectedDevices();
    const connectedDeviceIds = new Set(connectedDevices.map((d) => d.id));

    let clearedCount = 0;
    const cursorsToRemove: string[] = [];

    for (const [cursorId, cursor] of this.cursors) {
      if (!connectedDeviceIds.has(cursorId)) {
        cursorsToRemove.push(cursorId);
      }
    }

    for (const cursorId of cursorsToRemove) {
      this.removeCursor(cursorId);
      clearedCount++;
    }

    return clearedCount;
  }

  private simulateDeviceDisconnect(deviceId: string): void {
    if (this.cursors.has(deviceId)) {
      this.removeCursor(deviceId);
    }

    if (this.mouseDetector && typeof this.mouseDetector.removeDevice === 'function') {
      this.mouseDetector.removeDevice(deviceId);
    }

    this.updateDeviceDisplay();
  }

  public shutdown(): void {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    try {
      if (this.addonModule && this.cursorHidden) {
        const showResult = this.addonModule.showSystemCursor();

        if (!showResult) {
        }
      } else if (!this.addonModule) {
        console.warn('Module addon non disponible pour la restauration');
      } else {
      }
    } catch (error) {
      console.error('Erreur lors de la restauration du curseur:', error);

      try {
      } catch (fallbackError) {
        console.error('Échec de la restauration de secours:', fallbackError);
      }
    }

    if (this.renderRequestId) {
      clearImmediate(this.renderRequestId);
    }

    if (this.highPrecisionTimer) {
      clearTimeout(this.highPrecisionTimer);
    }

    if (this.lockTeleportInterval) {
      clearInterval(this.lockTeleportInterval);
      this.lockTeleportInterval = null;
    }

    if (this.periodicExportTimer) {
      clearInterval(this.periodicExportTimer);
    }

    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close();
      this.settingsWindow = null;
    }

    this.closeAllOverlays();

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
}

const OrionixApp = new OrionixAppElectron();

process.on('uncaughtException', (_error: Error) => {
  OrionixApp.shutdown();
});

process.on('unhandledRejection', (_reason: any) => {});

process.on('SIGINT', () => {
  OrionixApp.shutdown();
});

process.on('SIGTERM', () => {
  OrionixApp.shutdown();
});

if (process.platform === 'win32') {
  process.on('SIGHUP', () => {
    OrionixApp.shutdown();
  });
}



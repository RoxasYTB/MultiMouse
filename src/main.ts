import { exec } from 'child_process';
import * as chokidar from 'chokidar';
import { app, BrowserWindow, Display, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { CursorTypeDetector } from './cursor_type_detector';
import { RawInputMouseDetector } from './raw_input_detector';
import { AppConfig, MouseDevice, MouseMoveData } from './types';

if (process.platform === 'win32') {
  exec('chcp 65001');
}

const addon = require(path.join(__dirname, '..', 'bin', 'win32-x64-116', 'Buenox.node'));

const DEFAULT_CONFIG: AppConfig = {
  sensitivity: 1.5,
  refreshRate: 1,
  maxCursors: 4,
  cursorSize: 20,
  cursorColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
  highPerformanceMode: true,
  precisePositioning: true,
  allowTrayLeftClick: false,
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

class BuenoxAppElectron {
  private overlayWindow: BrowserWindow | null = null;
  private config: AppConfig = { ...DEFAULT_CONFIG };
  private configPath: string;
  private cursors: Map<string, CursorState> = new Map();
  private isShuttingDown: boolean = false;
  private lastActiveDevice: string | null = null;

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
  private targetFPS: number = 1000;
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

  constructor() {
    this.configPath = path.join(__dirname, '..', 'config.json');
    this.centerX = this.screenWidth / 2;
    this.centerY = this.screenHeight / 2;
    this.frameInterval = 1000 / this.targetFPS;

    this.mouseDetector = new RawInputMouseDetector();
    this.cursorTypeDetector = new CursorTypeDetector();

    console.log('Initialisation du gestionnaire de curseur système...');
    try {
      const addon = require(path.join(__dirname, '..', 'bin', 'win32-x64-116', 'Buenox.node'));

      try {
        const shutdownHandlerResult = addon.setupShutdownHandler();
        console.log('Gestionnaire de fermeture Windows activé:', shutdownHandlerResult);
      } catch (handlerError) {
        console.warn("Impossible d'activer le gestionnaire de fermeture Windows:", handlerError);
      }

      const initialCursorState = addon.getCursorState();
      console.log('État initial du curseur:', initialCursorState.type);
    } catch (error) {
      console.error('Erreur lors du masquage du curseur système:', error);
      this.cursorHidden = false;
    }

    this.setupMouseEvents();
    this.setupCursorTypeEvents();
    this.loadConfig();

    this.allowTrayLeftClick = !!this.config.allowTrayLeftClick;
    this.setupAppEvents();
    this.setupFileWatcher();
    this.initHighPerformanceLoop();
  }

  private initHighPerformanceLoop(): void {
    if (this.config.highPerformanceMode) {
      this.startHighPrecisionRendering();
    }
  }

  private manageSystemCursorVisibility(): void {
    const hasActiveCursors = this.cursors.size > 0;

    if (hasActiveCursors && !this.cursorHidden) {
      console.log('Masquage du curseur système (curseurs actifs détectés)...');
      try {
        const addon = require(path.join(__dirname, '..', 'bin', 'win32-x64-116', 'Buenox.node'));
        const hideResult = addon.hideSystemCursor();
        this.cursorHidden = hideResult || false;
        console.log('Curseur système masqué:', hideResult);
      } catch (error) {
        console.warn('Erreur lors du masquage du curseur système:', error);
      }
    } else if (!hasActiveCursors && this.cursorHidden) {
      console.log('Restauration du curseur système (aucun curseur actif)...');
      try {
        const addon = require(path.join(__dirname, '..', 'bin', 'win32-x64-116', 'Buenox.node'));
        const showResult = addon.showSystemCursor();
        if (showResult) {
          this.cursorHidden = false;
          console.log('Curseur système restauré:', showResult);
        } else {
          console.warn('Échec de la restauration du curseur système');
        }
      } catch (error) {
        console.warn('Erreur lors de la restauration du curseur système:', error);
      }
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

  private setupFileWatcher(): void {
    const filesToWatch = [path.join(__dirname, '..', 'overlay.css'), path.join(__dirname, '..', 'overlay.html'), path.join(__dirname, 'renderer.js')];

    this.fileWatcher = chokidar.watch(filesToWatch, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
    });

    this.fileWatcher.on('change', (_filePath: string) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.reload();
      }
    });
  }

  private setupMouseEvents(): void {
    this.mouseDetector.on('deviceAdded', (device: MouseDevice) => {
      console.log(`=== DEVICE ADDED ===`);
      console.log(`Device ID: ${device.id}, Name: ${device.name}`);
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('deviceRemoved', (device: MouseDevice) => {
      console.log(`=== DEVICE REMOVED ===`);
      console.log(`Device ID: ${device.id}, Name: ${device.name}`);
      console.log(`Suppression du curseur associé...`);
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
    app.whenReady().then(async () => {
      const primaryDisplay: Display = screen.getPrimaryDisplay();
      this.screenWidth = primaryDisplay.size.width;
      this.screenHeight = primaryDisplay.size.height;
      this.fullScreenWidth = primaryDisplay.size.width;
      this.fullScreenHeight = primaryDisplay.size.height;
      this.centerX = this.screenWidth / 2;
      this.centerY = this.screenHeight / 2;

      try {
        await this.exportCursors();
      } catch (error) {
        console.warn("Impossible d'exporter les curseurs au démarrage:", error);
      }

      this.calibrateCoordinateMapping();
      this.startMouseInput();
      this.createOverlayWindow();
      this.createTray();
      this.setupIPC();

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

  private convertHTMLToSystemCoordinates(htmlX: number, htmlY: number): { x: number; y: number } {
    return {
      x: htmlX * 1.25,
      y: htmlY * 1.25,
    };
  }

  private analyzeCoordinateAccuracy(htmlPos: any, systemPos: any): void {
    if (!htmlPos || !systemPos) return;
    const deltaX = Math.abs(systemPos.x - htmlPos.x);
    const deltaY = Math.abs(systemPos.y - htmlPos.y);
    if (deltaX > 2 || deltaY > 2) {
    }
  }

  private async exportCursors(): Promise<void> {
    console.log('=== EXPORT DES CURSEURS AU DÉMARRAGE ===');

    try {
      let scriptPath: string;

      if (app.isPackaged) {
        scriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'export-cursors.ps1');
      } else {
        scriptPath = path.join(__dirname, '..', 'export-cursors.ps1');
      }

      console.log(`Chemin du script PowerShell: ${scriptPath}`);

      if (!fs.existsSync(scriptPath)) {
        console.error(`Script PowerShell introuvable: ${scriptPath}`);
        return;
      }

      const workingDir = path.dirname(scriptPath);
      console.log(`Répertoire de travail: ${workingDir}`);

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
              console.log('Sortie PowerShell:', stdout);
            }

            console.log('✅ Export des curseurs terminé avec succès');
            resolve();
          },
        );
      });
    } catch (error) {
      console.error("Erreur lors de l'export des curseurs:", error);
      throw error;
    }
  }

  private convertSystemToHTMLCoordinates(systemX: number, systemY: number): { x: number; y: number } {
    return {
      x: systemX,
      y: systemY,
    };
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

      console.log('Tentative de chargement icône tray:', iconPath);
      console.log('Icône existe:', fs.existsSync(iconPath));

      let trayImage: Electron.NativeImage;
      if (fs.existsSync(iconPath)) {
        trayImage = nativeImage.createFromPath(iconPath);
        console.log('Icône tray chargée avec succès');
      } else {
        console.log('Icône tray non trouvée, utilisation icône vide');
        trayImage = nativeImage.createEmpty();
      }

      this.tray = new Tray(trayImage);
      this.tray.setToolTip('Buenox');
      this.updateTrayMenu();

      this.tray.on('click', () => {
        if (!this.allowTrayLeftClick) {
          console.log('Left-click on tray ignored (allowTrayLeftClick=false)');
          return;
        }

        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          if (this.overlayWindow.isVisible()) {
            this.overlayWindow.hide();
          } else {
            this.overlayWindow.show();
          }
        }
      });
    } catch (error) {
      console.error('Erreur lors de la création de la tray:', error);
    }
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Quitter',
        click: () => {
          this.shutdown();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
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
      this.manageSystemCursorVisibility();
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

  sendInstantCursorUpdate(cursor: CursorState): void {
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
      const cursor = this.cursors.get(deviceId)!;
      console.log(`=== REMOVING CURSOR ===`);
      console.log(`Suppression du curseur pour device: ${deviceId}`);
      console.log(`Device name: ${cursor.deviceName}`);
      console.log(`Last update: ${new Date(cursor.lastUpdate).toLocaleTimeString()}`);
      console.log(`Total movement: ${cursor.totalMovement.toFixed(2)}`);

      this.cursors.delete(deviceId);
      this.manageSystemCursorVisibility();

      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        console.log(`Envoi de l'événement cursor-removed au renderer...`);
        this.overlayWindow.webContents.send('cursor-removed', deviceId);
      }

      if (this.lastActiveDevice === deviceId) {
        const remainingCursors = Array.from(this.cursors.keys());
        this.lastActiveDevice = remainingCursors.length > 0 ? remainingCursors[0] : null;
        console.log(`Device actif changé vers: ${this.lastActiveDevice || 'aucun'}`);
      }

      this.updateDeviceDisplay();

      console.log(`Curseur ${deviceId} supprimé avec succès. Curseurs restants: ${this.cursors.size}`);
    } else {
      console.log(`⚠️ Tentative de suppression d'un curseur inexistant: ${deviceId}`);
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

  private createOverlayWindow(): void {
    console.log('Creation de la fenetre overlay...');

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
        webSecurity: false,
        devTools: true,
      },
    });

    this.overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));

    this.overlayWindow.once('ready-to-show', () => {
      console.log('Fenetre overlay prete, affichage...');
      this.overlayWindow!.show();
      this.overlayWindow!.setIgnoreMouseEvents(true);

      console.log('Overlay window visible:', !this.overlayWindow!.isDestroyed());
      console.log('Devices connectes:', this.mouseDetector.getDeviceCount());

      let needDevTools = false;
      if (needDevTools) {
        this.overlayWindow!.webContents.openDevTools({ mode: 'detach' });
      }

      setTimeout(() => {
        this.sendExistingCursorsToRenderer();
      }, 1000);
    });

    this.overlayWindow.on('closed', () => {
      console.log('Fenêtre overlay fermée');
      this.overlayWindow = null;
    });

    this.overlayWindow.on('close', (e) => {
      console.log("Fermeture de l'application demandée");
      this.shutdown();
    });

    if (process.platform === 'win32') {
      this.overlayWindow.setSkipTaskbar(true);
    }
  }

  private sendExistingCursorsToRenderer(): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    console.log('=== ENVOI CURSEURS EXISTANTS AU RENDERER ===');
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

    console.log('Curseurs à envoyer:', existingCursors);

    if (existingCursors.length > 0) {
      this.overlayWindow.webContents.send('cursors-instant-update', {
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
      console.log("=== RENDERER SIGNALE QU'IL EST PRET ===");
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
      console.log('[IPC] Force scan des périphériques demandé');

      return { success: true, message: 'Surveillance USB automatique active' };
    });

    ipcMain.handle('get-monitored-devices', () => {
      const devices = this.mouseDetector.getMonitoredDevices();
      console.log('[IPC] Périphériques surveillés:', devices.length);
      return devices;
    });

    ipcMain.handle('get-active-cursors', () => {
      const cursors = Array.from(this.cursors.values());
      console.log('[IPC] Curseurs actifs:', cursors.length);
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
      console.log('[IPC] Nettoyage des curseurs déconnectés demandé');
      const clearedCount = this.clearDisconnectedCursors();
      return { success: true, clearedCount, message: `${clearedCount} curseurs nettoyés` };
    });

    ipcMain.handle('simulate-device-disconnect', (_, deviceId: string) => {
      console.log(`[IPC] Simulation de déconnexion demandée pour: ${deviceId}`);
      this.simulateDeviceDisconnect(deviceId);
      return { success: true, message: `Déconnexion simulée pour ${deviceId}` };
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

  private clearDisconnectedCursors(): number {
    const connectedDevices = this.mouseDetector.getConnectedDevices();
    const connectedDeviceIds = new Set(connectedDevices.map((d) => d.id));

    let clearedCount = 0;
    const cursorsToRemove: string[] = [];

    for (const [cursorId, cursor] of this.cursors) {
      if (!connectedDeviceIds.has(cursorId)) {
        console.log(`[ClearCursors] Curseur orphelin détecté: ${cursorId} - ${cursor.deviceName}`);
        cursorsToRemove.push(cursorId);
      }
    }

    for (const cursorId of cursorsToRemove) {
      this.removeCursor(cursorId);
      clearedCount++;
    }

    console.log(`[ClearCursors] ${clearedCount} curseurs orphelins supprimés`);
    return clearedCount;
  }

  private simulateDeviceDisconnect(deviceId: string): void {
    console.log(`[SimulateDisconnect] Simulation de déconnexion pour: ${deviceId}`);

    if (this.cursors.has(deviceId)) {
      console.log(`[SimulateDisconnect] Suppression du curseur: ${deviceId}`);
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

    console.log('Restauration du curseur système...');
    try {
      const addon = require(path.join(__dirname, '..', 'bin', 'win32-x64-116', 'Buenox.node'));
      if (this.cursorHidden) {
        const showResult = addon.showSystemCursor();
        console.log('Curseur système restauré:', showResult);

        if (!showResult) {
          console.log('Échec de la restauration automatique, tentative de restauration manuelle...');
        }
      } else {
        console.log("Le curseur système n'était pas masqué");
      }
    } catch (error) {
      console.error('Erreur lors de la restauration du curseur:', error);

      try {
        console.log('Tentative de restauration de secours...');
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

    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    if (this.mouseDetector) {
      this.mouseDetector.stop();
    }

    if (this.cursorTypeDetector) {
      this.cursorTypeDetector.stop();
    }

    this.saveConfig();
    app.quit();
  }
}

const BuenoxApp = new BuenoxAppElectron();

console.log('Buenox Electron app started.');

process.on('uncaughtException', (_error: Error) => {
  console.log('Exception non capturée détectée, restauration des curseurs...');
  BuenoxApp.shutdown();
});

process.on('unhandledRejection', (_reason: any) => {});

process.on('SIGINT', () => {
  console.log('Signal SIGINT reçu, restauration des curseurs...');
  BuenoxApp.shutdown();
});

process.on('SIGTERM', () => {
  console.log('Signal SIGTERM reçu, restauration des curseurs...');
  BuenoxApp.shutdown();
});

if (process.platform === 'win32') {
  process.on('SIGHUP', () => {
    console.log('Signal SIGHUP reçu, restauration des curseurs...');
    BuenoxApp.shutdown();
  });
}


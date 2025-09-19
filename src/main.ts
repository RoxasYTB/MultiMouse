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
  private centerX: number;
  private centerY: number;

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

  constructor() {
    console.log('=== DEMARRAGE MULTIMOUSE ELECTRON ===');
    console.log('Configuration par defaut:', DEFAULT_CONFIG);

    this.configPath = path.join(__dirname, '..', 'config.json');
    this.centerX = this.screenWidth / 2;
    this.centerY = this.screenHeight / 2;
    this.frameInterval = 1000 / this.targetFPS;

    console.log('Initialisation des detecteurs...');
    this.mouseDetector = new RawInputMouseDetector();
    this.cursorTypeDetector = new CursorTypeDetector();

    console.log('Configuration des evenements...');
    this.setupMouseEvents();
    this.setupCursorTypeEvents();

    console.log('Chargement de la configuration...');
    this.loadConfig();

    console.log('Configuration des evenements app...');
    this.setupAppEvents();

    console.log('Configuration du watcher de fichiers...');
    this.setupFileWatcher();

    console.log('Initialisation de la boucle haute performance...');
    this.initHighPerformanceLoop();

    console.log('=== INITIALISATION TERMINEE ===');
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

    this.fileWatcher.on('change', (_filePath: string) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.reload();
      }
    });
  }

  private setupMouseEvents(): void {
    console.log('Configuration des evenements de souris...');

    this.mouseDetector.on('deviceAdded', (device: MouseDevice) => {
      console.log('Nouveau peripherique detecte:', device);
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('deviceRemoved', (device: MouseDevice) => {
      console.log('Peripherique retire:', device);
      this.removeCursor(device.id);
      this.updateDeviceDisplay();
    });

    this.mouseDetector.on('mouseMove', (data: MouseMoveData) => {
      if (data.isRawInput || process.env.NODE_ENV === 'development') {
      }
      this.handleMouseMove(data);
    });

    this.mouseDetector.on('started', () => {
      console.log('Detecteur de souris demarre avec succes');
    });

    this.mouseDetector.on('stopped', () => {
      console.log('Detecteur de souris arrete');
    });
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
      if (process.platform !== 'darwin') {
        console.log("Toutes les fenetres fermees, mais l'app reste active pour le multi-souris");
      }
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

  private async calibrateCoordinateMapping(): Promise<void> {}

  private convertHTMLToSystemCoordinates(htmlX: number, htmlY: number): { x: number; y: number } {
    return {
      x: htmlX * 1.25,
      y: htmlY * 1.25,
    };
  }

  private startMouseInput(): void {
    console.log('Demarrage de la detection des souris...');

    const success = this.mouseDetector.start();
    console.log('Raw input demarre:', success);

    if (success) {
      this.centerSystemCursor();
      console.log('Raw input initialise avec succes');
    } else {
      console.log('Echec du demarrage raw input, mode fallback actif...');
      console.log('Veuillez connecter plusieurs souris pour tester la detection');

      this.tryAlternativeDetection();
    }

    console.log('Demarrage de la detection du type de curseur...');
    this.cursorTypeDetector.start();
  }

  private tryAlternativeDetection(): void {
    console.log('=== TENTATIVE DETECTION ALTERNATIVE ===');

    const { exec } = require('child_process');

    exec('powershell "Get-WmiObject -Class Win32_PointingDevice | Select-Object Name, Description, DeviceID"', (error: any, stdout: string, _stderr: string) => {
      if (error) {
        console.error('Erreur PowerShell:', error);
        return;
      }

      console.log('Dispositifs de pointage detectes par Windows:');
      console.log(stdout);

      const lines = stdout.split('\n').filter((line) => line.trim() && !line.includes('Name') && !line.includes('---'));
      const mouseCount = lines.filter((line) => line.toLowerCase().includes('mouse') || line.toLowerCase().includes('souris') || line.toLowerCase().includes('pointing')).length;

      console.log(`Nombre de dispositifs de pointage detectes: ${mouseCount}`);

      if (mouseCount >= 2) {
        console.log('PLUSIEURS SOURIS DETECTEES ! Raw Input devrait fonctionner.');
        console.log('Si Raw Input ne fonctionne pas, essayez:');
        console.log('1. Appuyez sur F4 pour forcer le rechargement');
        console.log("2. Lancez l'application en tant qu'administrateur");
        console.log("3. Redemarrez l'application");
      } else {
        console.log('Une seule souris detectee. Connectez une deuxieme souris pour utiliser le multi-curseur.');
      }
    });

    this.detectHIDMice();
  }

  private detectHIDMice(): void {
    console.log('=== DETECTION VIA PILOTES HID ===');

    const { exec } = require('child_process');

    exec("powershell \"Get-PnpDevice | Where-Object {$_.Class -eq 'Mouse' -or $_.FriendlyName -like '*Mouse*' -or $_.FriendlyName -like '*Souris*'} | Select-Object FriendlyName, Status, InstanceId\"", (error: any, stdout: string, _stderr: string) => {
      if (error) {
        console.error('Erreur detection HID:', error);
        return;
      }

      console.log('Pilotes de souris HID:');
      console.log(stdout);

      const activeDevices = stdout.split('\n').filter((line) => line.includes('OK') && (line.toLowerCase().includes('mouse') || line.toLowerCase().includes('souris')));

      console.log(`Pilotes de souris actifs detectes: ${activeDevices.length}`);

      if (activeDevices.length >= 2) {
        console.log('MULTIPLES PILOTES DE SOURIS DETECTES !');
        console.log('Cela confirme que vous avez plusieurs souris.');
        console.log('Raw Input devrait pouvoir les detecter.');
      }
    });
  }

  private centerSystemCursor(): void {
    if (this.mouseDetector.rawInputModule?.setSystemCursorPos) {
      this.mouseDetector.rawInputModule.setSystemCursorPos(this.centerX, this.centerY);
    }
  }

  private handleMouseMove(mouseData: MouseMoveData): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('Mouvement souris détecté:', mouseData.deviceId, 'dx:', mouseData.dx, 'dy:', mouseData.dy);
    }

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
      console.log('Nouveau curseur créé pour device:', cursorId, deviceName);

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

    globalShortcut.register('F1', () => {
      console.log('Redemarrage de la detection des souris...');
      this.mouseDetector.stop();
      setTimeout(() => {
        const success = this.mouseDetector.start();
        console.log('Redemarrage Raw Input:', success ? 'succes' : 'echec');
      }, 1000);
    });

    globalShortcut.register('F2', () => {
      console.log('Nettoyage de tous les curseurs...');
      this.cursors.clear();
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('cursors-instant-update', {
          cursors: [],
          lastActiveDevice: null,
          timestamp: performance.now(),
        });
      }
    });

    globalShortcut.register('F3', () => {
      console.log('=== INFORMATIONS DES DISPOSITIFS ===');
      console.log('Curseurs actifs:', this.cursors.size);
      console.log('Devices connectes:', this.mouseDetector.getDeviceCount());
      console.log('Raw Input actif:', this.mouseDetector.isRunning());
      console.log('Module C++ charge:', this.mouseDetector.rawInputModule !== null);
      console.log('Liste des curseurs:');
      this.cursors.forEach((cursor, id) => {
        console.log(`- ${id}: ${cursor.deviceName} at (${Math.round(cursor.x)}, ${Math.round(cursor.y)})`);
      });
    });

    globalShortcut.register('F4', () => {
      console.log('Tentative de rechargement force du module Raw Input...');
      this.forceReloadRawInput();
    });

    console.log('Raccourcis claviers configures:');
    console.log('F1: Redemarrer detection souris');
    console.log('F2: Nettoyer curseurs');
    console.log('F3: Infos dispositifs');
    console.log('F4: Recharger Raw Input');
  }

  private forceReloadRawInput(): void {
    console.log('=== RECHARGEMENT FORCE RAW INPUT ===');

    this.mouseDetector.stop();

    setTimeout(() => {
      console.log('Tentative 1: Redemarrage standard...');
      let success = this.mouseDetector.start();

      if (!success) {
        console.log('Tentative 2: Recreation du detecteur...');
        this.mouseDetector = new RawInputMouseDetector();
        this.setupMouseEvents();
        success = this.mouseDetector.start();
      }

      console.log('Resultat rechargement force:', success ? 'SUCCES' : 'ECHEC');

      if (success) {
        console.log('Raw Input maintenant actif - testez vos souris !');
      } else {
        console.log('PROBLEME: Raw Input toujours inactif');
        console.log('Suggestions:');
        console.log("1. Lancez l'application en tant qu'administrateur");
        console.log('2. Verifiez que plusieurs souris sont connectees');
        console.log("3. Redemarrez l'application completement");
      }
    }, 1500);
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
      },
    });

    this.overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));

    this.overlayWindow.once('ready-to-show', () => {
      console.log('Fenetre overlay prete, affichage...');
      this.overlayWindow!.show();
      this.overlayWindow!.setIgnoreMouseEvents(true);

      console.log('Overlay window visible:', !this.overlayWindow!.isDestroyed());
      console.log('Devices connectes:', this.mouseDetector.getDeviceCount());
    });

    this.overlayWindow.on('closed', () => {
      console.log('Fenêtre overlay fermée');
      this.overlayWindow = null;
    });

    this.overlayWindow.on('close', (e) => {
      console.log('Tentative de fermeture overlay interceptée');
      e.preventDefault();
      this.overlayWindow!.hide();
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

    ipcMain.on('mouse-move', (_event, mouseData: MouseMoveData) => {
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
}

const multimouseApp = new MultimouseApp();

console.log('Multimouse Electron app started.');

process.on('uncaughtException', (_error: Error) => {
  multimouseApp.shutdown();
});

process.on('unhandledRejection', (_reason: any) => {});


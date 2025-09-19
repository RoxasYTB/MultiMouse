import { EventEmitter } from 'events';
import * as path from 'path';
import { DeviceChangeData, MouseDevice, MouseMoveData, RawInputModuleInterface } from './types';

export class RawInputMouseDetector extends EventEmitter {
  private isActive: boolean = false;
  private devices: Map<string, MouseDevice> = new Map();
  private messageProcessInterval: NodeJS.Timeout | null = null;
  public rawInputModule: RawInputModuleInterface | null = null;

  constructor() {
    super();
  }

  public start(): boolean {
    if (this.isActive) return true;

    console.log('=== DEMARRAGE RAW INPUT ===');

    try {
      const modulePath = path.join(__dirname, '..', 'build', 'Release', 'multimouse_raw_input.node');
      console.log('Chemin module C++:', modulePath);

      const fs = require('fs');
      if (!fs.existsSync(modulePath)) {
        console.error('ERREUR: Module C++ introuvable a:', modulePath);
        return false;
      }

      console.log('Module C++ trouve, chargement...');
      this.rawInputModule = require(modulePath) as RawInputModuleInterface;
      console.log('Module C++ charge avec succes');

      if (!this.rawInputModule.setCallbacks) {
        console.error('ERREUR: Methode setCallbacks manquante dans le module');
        return false;
      }

      console.log('Configuration des callbacks...');
      this.rawInputModule.setCallbacks(this.handleMouseMove.bind(this), this.handleDeviceChange.bind(this));

      console.log('Demarrage Raw Input...');
      const success = this.rawInputModule.startRawInput();
      console.log('Resultat startRawInput():', success);

      if (!success) {
        console.error('ECHEC: startRawInput() a retourne false');
        console.log('Cela peut indiquer:');
        console.log('- Permissions insuffisantes (essayez en administrateur)');
        console.log('- Aucune souris multiple detectee');
        console.log("- Conflit avec d'autres applications");
        return false;
      }

      this.isActive = true;

      this.messageProcessInterval = setInterval(() => {
        if (this.rawInputModule) {
          this.rawInputModule.processMessages();
        }
      }, 16);

      console.log('Raw Input demarre avec SUCCES !');
      this.emit('started');
      return true;
    } catch (error) {
      console.error('EXCEPTION lors du demarrage Raw Input:', error);
      console.log("Details de l'erreur:", error);
      return false;
    }
  }

  public stop(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.messageProcessInterval) {
      clearInterval(this.messageProcessInterval);
      this.messageProcessInterval = null;
    }

    if (this.rawInputModule) {
      this.rawInputModule.stopRawInput();
      this.rawInputModule = null;
    }

    this.devices.clear();

    this.emit('stopped');
  }

  public isRunning(): boolean {
    return this.isActive;
  }

  private handleMouseMove(moveData: any): void {
    let actualData: any;
    if (moveData && moveData.type === 'mouseMove' && moveData.device) {
      actualData = {
        deviceHandle: moveData.device.handle,
        deviceName: moveData.device.name,
        x: moveData.device.x,
        y: moveData.device.y,
        dx: moveData.device.deltaX,
        dy: moveData.device.deltaY,
        flags: moveData.device.flags,
      };
    } else {
      actualData = moveData;
    }

    if (!actualData || actualData.deviceHandle === undefined || actualData.deviceHandle === null) {
      return;
    }

    if ((actualData.dx === 0 && actualData.dy === 0) || (actualData.dx === undefined && actualData.dy === undefined)) {
      return;
    }

    const deviceKeyCheck = `device_${actualData.deviceHandle}`;
    if (!this.devices.has(deviceKeyCheck)) {
      console.log('NOUVEAU DEVICE DETECTE via mouvement:', actualData.deviceHandle, actualData.deviceName);
    }

    let cleanDeviceName = 'Périphérique Inconnu';
    if (actualData.deviceName && typeof actualData.deviceName === 'string') {
      cleanDeviceName = actualData.deviceName
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanDeviceName.length === 0) {
        cleanDeviceName = 'Périphérique Inconnu';
      }
    }

    const deviceKey = `device_${actualData.deviceHandle}`;

    if (!this.devices.has(deviceKey)) {
      const device: MouseDevice = {
        id: deviceKey,
        handle: actualData.deviceHandle,
        name: cleanDeviceName,
        x: actualData.x || 0,
        y: actualData.y || 0,
        connected: true,
        lastSeen: Date.now(),
      };

      this.devices.set(deviceKey, device);

      this.emit('deviceAdded', device);
    } else {
      const device = this.devices.get(deviceKey)!;
      device.x = actualData.x || device.x || 0;
      device.y = actualData.y || device.y || 0;
      device.lastSeen = Date.now();
    }

    const validX = typeof actualData.x === 'number' && !isNaN(actualData.x);
    const validY = typeof actualData.y === 'number' && !isNaN(actualData.y);

    if (!validX || !validY) {
      return;
    }

    const mouseData: MouseMoveData = {
      deviceId: deviceKey,
      deviceName: cleanDeviceName,
      deviceHandle: actualData.deviceHandle,
      x: actualData.x,
      y: actualData.y,
      dx: actualData.dx || 0,
      dy: actualData.dy || 0,
      timestamp: Date.now(),
      isRawInput: true,
    };

    this.emit('mouseMove', mouseData);
  }

  private handleDeviceChange(deviceData: DeviceChangeData): void {
    const deviceKey = `device_${deviceData.handle}`;

    if (deviceData.action === 'added') {
      if (!this.devices.has(deviceKey)) {
        const device: MouseDevice = {
          id: deviceKey,
          handle: deviceData.handle,
          name: deviceData.name,
          x: deviceData.x || 0,
          y: deviceData.y || 0,
          connected: true,
          lastSeen: Date.now(),
        };

        this.devices.set(deviceKey, device);
        console.log('NOUVEAU DEVICE AJOUTE:', device.name, '- Handle:', device.handle);

        this.emit('deviceAdded', device);
      }
    } else if (deviceData.action === 'removed') {
      const device = this.devices.get(deviceKey);
      if (device) {
        this.devices.delete(deviceKey);
        console.log('DEVICE SUPPRIME:', device.name, '- Handle:', device.handle);

        this.emit('deviceRemoved', device);
      }
    }
  }

  public getConnectedDevices(): MouseDevice[] {
    return Array.from(this.devices.values()).filter((device) => device.connected);
  }

  public getDeviceCount(): number {
    return this.getConnectedDevices().length;
  }

  public getDeviceInfo(deviceId: string): MouseDevice | null {
    return this.devices.get(deviceId) || null;
  }

  public getNativeDevices(): any[] {
    if (this.rawInputModule) {
      return this.rawInputModule.getDevices();
    }
    return [];
  }

  public simulateNewMouse(): string {
    const deviceId = `test_mouse_${Date.now()}`;
    const testDevice: MouseDevice = {
      id: deviceId,
      handle: 99999 + Math.floor(Math.random() * 1000),
      name: 'Test Mouse',
      x: 500,
      y: 500,
      connected: true,
      lastSeen: Date.now(),
    };

    this.devices.set(deviceId, testDevice);

    this.emit('deviceAdded', testDevice);
    return deviceId;
  }

  public removeDevice(deviceId: string): void {
    if (this.devices.has(deviceId)) {
      const device = this.devices.get(deviceId)!;
      this.devices.delete(deviceId);

      this.emit('deviceRemoved', device);
    }
  }

  public cleanupInactiveDevices(): void {}
}


import { exec } from 'child_process';
import { EventEmitter } from 'events';

interface USBDevice {
  deviceId: string;
  name: string;
  vid?: string;
  pid?: string;
}

export class ImprovedUSBMonitor extends EventEmitter {
  private isActive: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private connectedDevices: Map<string, USBDevice> = new Map();
  private lastCheckTime: number = 0;
  private static readonly MONITOR_INTERVAL = 2000;
  private static readonly DEBOUNCE_TIME = 1000;

  constructor() {
    super();
  }

  public start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.updateDeviceList(() => {
      this.monitorInterval = setInterval(() => {
        this.checkDeviceChanges();
      }, ImprovedUSBMonitor.MONITOR_INTERVAL);
    });

    this.emit('started');
  }

  public stop(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.connectedDevices.clear();
    this.emit('stopped');
  }

  private updateDeviceList(callback?: () => void): void {
    const command = `powershell -Command "Get-WmiObject -Class Win32_PointingDevice | Where-Object {$_.Status -eq 'OK'} | Select-Object DeviceID, Name | ConvertTo-Json"`;

    exec(command, { encoding: 'utf8', timeout: 5000 }, (error, stdout) => {
      if (error) {
        console.log('Erreur USB monitoring:', error.message);
        if (callback) callback();
        return;
      }

      try {
        const devices = JSON.parse(stdout || '[]');
        const deviceArray = Array.isArray(devices) ? devices : [devices];

        this.connectedDevices.clear();

        deviceArray.forEach((device: any) => {
          if (device.DeviceID && device.Name) {
            this.connectedDevices.set(device.DeviceID, {
              deviceId: device.DeviceID,
              name: device.Name,
            });
          }
        });

        
      } catch (parseError) {
        console.log('Erreur parsing USB devices:', parseError);
      }

      if (callback) callback();
    });
  }

  private checkDeviceChanges(): void {
    if (!this.isActive) return;

    const now = Date.now();

    if (now - this.lastCheckTime < ImprovedUSBMonitor.DEBOUNCE_TIME) {
      return;
    }

    this.lastCheckTime = now;
    const previousDevices = new Map(this.connectedDevices);

    this.updateDeviceList(() => {
      for (const [deviceId, device] of previousDevices) {
        if (!this.connectedDevices.has(deviceId)) {
          console.log(`USB Monitor: Souris déconnectée: ${device.name}`);
          this.emit('mouseDisconnected', {
            deviceId: deviceId,
            name: device.name,
          });
        }
      }

      for (const [deviceId, device] of this.connectedDevices) {
        if (!previousDevices.has(deviceId)) {
          console.log(`USB Monitor: Nouvelle souris: ${device.name}`);
          this.emit('mouseConnected', {
            deviceId: deviceId,
            name: device.name,
          });
        }
      }
    });
  }

  public getConnectedDevices(): USBDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  public findMatchingUSBDevice(rawInputDeviceName: string): USBDevice | null {
    for (const device of this.connectedDevices.values()) {
      if (device.name.toLowerCase().includes('mouse') || device.name.toLowerCase().includes('souris') || rawInputDeviceName.toLowerCase().includes(device.name.toLowerCase().split(' ')[0])) {
        return device;
      }
    }
    return null;
  }
}


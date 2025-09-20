import { exec } from 'child_process';
import { EventEmitter } from 'events';

export class SimpleUSBMonitor extends EventEmitter {
  private isActive: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private connectedDevices: Set<string> = new Set();

  constructor() {
    super();
  }

  public start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.updateDeviceList();

    this.monitorInterval = setInterval(() => {
      this.checkDeviceChanges();
    }, 500);

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

  private updateDeviceList(): void {
    const command = 'powershell -Command "Get-WmiObject -Class Win32_PointingDevice | Select-Object -ExpandProperty DeviceID"';

    exec(command, { encoding: 'utf8' }, (error, stdout) => {
      if (error) return;

      const devices = stdout
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && line.length > 0);

      this.connectedDevices = new Set(devices);
    });
  }

  private checkDeviceChanges(): void {
    if (!this.isActive) return;

    const previousDevices = new Set(this.connectedDevices);
    const command = 'powershell -Command "Get-WmiObject -Class Win32_PointingDevice | Select-Object -ExpandProperty DeviceID"';

    exec(command, { encoding: 'utf8' }, (error, stdout) => {
      if (error) return;

      const currentDevices = stdout
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && line.length > 0);

      const currentDevicesSet = new Set(currentDevices);

      for (const device of previousDevices) {
        if (!currentDevicesSet.has(device)) {
          this.emit('mouseDisconnected', { deviceId: device, name: device });
        }
      }

      for (const device of currentDevicesSet) {
        if (!previousDevices.has(device)) {
          this.emit('mouseConnected', { deviceId: device, name: device });
        }
      }

      this.connectedDevices = currentDevicesSet;
    });
  }

  public getConnectedDevices(): string[] {
    return Array.from(this.connectedDevices);
  }
}


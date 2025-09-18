import { exec } from 'child_process';
import { screen } from 'electron';
import EventEmitter from 'events';

class MouseDetector extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.lastMouseData = new Map();
    this.isActive = false;
    this.mouseEventListener = null;
    this.simulatedDeviceId = 1;
    this.trackingInterval = null;
    this.deviceScanInterval = null;

    this.detectionThreshold = 50;
    this.timeThreshold = 100;
  }

  start() {
    if (this.isActive) return;

    this.isActive = true;

    this.scanForMouseDevices();

    this.deviceScanInterval = setInterval(() => {
      this.scanForMouseDevices();
    }, 5000);

    this.startMouseTracking();

    this.emit('started');
    return true;
  }

  stop() {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    if (this.deviceScanInterval) {
      clearInterval(this.deviceScanInterval);
      this.deviceScanInterval = null;
    }

    this.devices.clear();
    this.lastMouseData.clear();

    this.emit('stopped');
  }

  scanForMouseDevices() {
    const command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-WmiObject -Class Win32_PointingDevice | Where-Object {$_.Status -eq 'OK'} | Select-Object Name, DeviceID, Status | ConvertTo-Json -Compress`;

    exec(`powershell -Command "${command}"`, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        if (!this.devices.has('main-mouse')) {
          this.addDevice('main-mouse', 'Souris Système Principal');
        }
        return;
      }

      try {
        const devices = JSON.parse(stdout);
        const deviceArray = Array.isArray(devices) ? devices : [devices];

        const previousDevices = new Set(this.devices.keys());
        const currentDeviceIds = new Set(deviceArray.map((d) => d.DeviceID));

        deviceArray.forEach((device, index) => {
          if (device.Status === 'OK') {
            const deviceId = device.DeviceID || `mouse-${index}`;
            let deviceName = device.Name || `Souris #${index + 1}`;

            deviceName = deviceName.replace(/[^\x20-\x7E]/g, '').trim() || `Souris ${index + 1}`;

            if (!this.devices.has(deviceId)) {
              this.addDevice(deviceId, deviceName);

              const displays = screen.getAllDisplays();
              const primaryDisplay = displays[0];
              const x = (index * 200) % primaryDisplay.bounds.width;
              const y = (index * 150) % primaryDisplay.bounds.height;
              this.updateDevicePosition(deviceId, x, y);
            } else {
              const existingDevice = this.devices.get(deviceId);
              existingDevice.lastSeen = Date.now();
            }
          }
        });

        previousDevices.forEach((deviceId) => {
          if (!currentDeviceIds.has(deviceId)) {
            this.removeDevice(deviceId);
          }
        });

        this.emit('devicesUpdated', {
          devices: this.getConnectedDevices(),
          count: currentDeviceIds.size,
        });
      } catch {
        if (!this.devices.has('main-mouse')) {
          this.addDevice('main-mouse', 'Souris Système Principal');
        }
      }
    });
  }

  addDevice(deviceId, deviceName = 'Souris Inconnue') {
    if (!this.devices.has(deviceId)) {
      const device = {
        id: deviceId,
        name: deviceName,
        connected: true,
        lastSeen: Date.now(),
        x: 0,
        y: 0,
      };

      this.devices.set(deviceId, device);

      this.emit('deviceAdded', device);

      this.updateDeviceDisplay();
    }
  }

  removeDevice(deviceId) {
    if (this.devices.has(deviceId)) {
      const device = this.devices.get(deviceId);
      device.connected = false;

      this.emit('deviceRemoved', device);
      this.devices.delete(deviceId);
    }
  }

  startMouseTracking() {
    this.trackingInterval = setInterval(() => {
      if (this.isActive) {
        this.updateMousePositions();
      }
    }, 1);
  }

  updateMousePositions() {
    const currentTime = Date.now();
    const cursor = screen.getCursorScreenPoint();

    let primaryDeviceId = null;
    const devices = Array.from(this.devices.keys());

    if (devices.length > 0) {
      primaryDeviceId = devices[0];
    }

    for (const [deviceId, device] of this.devices) {
      if (device.connected) {
        if (deviceId === primaryDeviceId) {
          this.updateDevicePosition(deviceId, cursor.x, cursor.y);

          this.emit('mouseMove', {
            deviceId: deviceId,
            deviceName: device.name,
            x: cursor.x,
            y: cursor.y,
            timestamp: currentTime,
            isPrimary: true,
          });
        } else {
          const deviceIndex = devices.indexOf(deviceId);
          const displays = screen.getAllDisplays();
          const primaryDisplay = displays[0];

          const time = currentTime / 1000;
          const radius = 100 + deviceIndex * 50;
          const speed = 0.5 + deviceIndex * 0.2;

          const centerX = primaryDisplay.bounds.width / 2 + deviceIndex * 300;
          const centerY = primaryDisplay.bounds.height / 2 + deviceIndex * 200;

          const newX = centerX + Math.cos(time * speed) * radius;
          const newY = centerY + Math.sin(time * speed) * radius;

          const clampedX = Math.max(0, Math.min(primaryDisplay.bounds.width - 50, newX));
          const clampedY = Math.max(0, Math.min(primaryDisplay.bounds.height - 50, newY));

          this.updateDevicePosition(deviceId, clampedX, clampedY);

          this.emit('mouseMove', {
            deviceId: deviceId,
            deviceName: device.name,
            x: clampedX,
            y: clampedY,
            timestamp: currentTime,
            isPrimary: false,
          });
        }
      }
    }
  }

  updateDevicePosition(deviceId, x, y) {
    if (this.devices.has(deviceId)) {
      const device = this.devices.get(deviceId);
      device.x = x;
      device.y = y;
      device.lastSeen = Date.now();
    }

    this.lastMouseData.set(deviceId, {
      x: x,
      y: y,
      time: Date.now(),
    });
  }

  updateDeviceDisplay() {
    const devices = this.getConnectedDevices();

    this.emit('devicesUpdated', {
      devices: devices,
      count: devices.length,
    });
  }

  getConnectedDevices() {
    return Array.from(this.devices.values()).filter((device) => device.connected);
  }

  getDeviceCount() {
    return this.getConnectedDevices().length;
  }

  getDeviceInfo(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  simulateNewMouse(name = null) {
    const deviceId = `simulated-mouse-${this.simulatedDeviceId++}`;
    const deviceName = name || `Souris Simulée #${this.simulatedDeviceId - 1}`;

    this.addDevice(deviceId, deviceName);

    const displays = screen.getAllDisplays();
    const primaryDisplay = displays[0];
    const x = Math.random() * primaryDisplay.bounds.width;
    const y = Math.random() * primaryDisplay.bounds.height;

    this.updateDevicePosition(deviceId, x, y);

    return deviceId;
  }

  cleanupInactiveDevices() {
    const currentTime = Date.now();
    const timeout = 5000;

    for (const [deviceId, device] of this.devices) {
      if (currentTime - device.lastSeen > timeout && deviceId !== 'main-mouse') {
        this.removeDevice(deviceId);
      }
    }
  }
}

export default MouseDetector;


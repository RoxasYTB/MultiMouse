const EventEmitter = require('events');
const path = require('path');

class RawInputMouseDetector extends EventEmitter {
  constructor() {
    super();
    this.isActive = false;
    this.devices = new Map();
    this.messageProcessInterval = null;
    this.rawInputModule = null;
  }

  start() {
    if (this.isActive) return true;

    try {
      const modulePath = path.join(__dirname, 'build', 'Release', 'multimouse_raw_input.node');
      console.log('🔧 Chargement du module RawInput depuis:', modulePath);
      this.rawInputModule = require(modulePath);
      console.log('✅ Module RawInput chargé avec succès');

      this.rawInputModule.setCallbacks(this.handleMouseMove.bind(this), this.handleDeviceChange.bind(this));
      console.log('🔗 Callbacks RawInput configurés');

      const success = this.rawInputModule.startRawInput();
      console.log('🚀 Démarrage RawInput:', success ? 'SUCCÈS' : 'ÉCHEC');

      if (!success) {
        console.error('❌ Échec du démarrage RawInput');
        return false;
      }

      this.isActive = true;
      console.log('🎯 RawInput activé avec succès');

      this.messageProcessInterval = setInterval(() => {
        if (this.rawInputModule) {
          this.rawInputModule.processMessages();
        }
      }, 16);

      setTimeout(() => {
        console.log('🧪 Test de simulation de mouvement...');
        this.simulateTestMovement();
      }, 1000);

      this.emit('started');
      return true;
    } catch (error) {
      console.error('💥 Erreur lors du démarrage RawInput:', error);
      return false;
    }
  }

  stop() {
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

  handleMouseMove(moveData) {
    let actualData;
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
      console.warn('⚠️ Données invalides, mouvement ignoré');
      return;
    }

    if ((actualData.dx === 0 && actualData.dy === 0) || (actualData.dx === undefined && actualData.dy === undefined)) {
      return;
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
      const device = {
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
      const device = this.devices.get(deviceKey);
      device.x = actualData.x || device.x || 0;
      device.y = actualData.y || device.y || 0;
      device.lastSeen = Date.now();
    }

    const validX = typeof actualData.x === 'number' && !isNaN(actualData.x);
    const validY = typeof actualData.y === 'number' && !isNaN(actualData.y);

    if (!validX || !validY) {
      return;
    }

    this.emit('mouseMove', {
      deviceId: deviceKey,
      deviceName: cleanDeviceName,
      deviceHandle: actualData.deviceHandle,
      x: actualData.x,
      y: actualData.y,
      dx: actualData.dx || 0,
      dy: actualData.dy || 0,
      timestamp: Date.now(),
      isRawInput: true,
    });
  }

  handleDeviceChange(deviceData) {
    const deviceKey = `device_${deviceData.handle}`;

    if (deviceData.action === 'added') {
      if (!this.devices.has(deviceKey)) {
        const device = {
          id: deviceKey,
          handle: deviceData.handle,
          name: deviceData.name,
          x: deviceData.x,
          y: deviceData.y,
          connected: true,
          lastSeen: Date.now(),
        };

        this.devices.set(deviceKey, device);

        this.emit('deviceAdded', device);
      }
    }
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

  getNativeDevices() {
    if (this.rawInputModule) {
      return this.rawInputModule.getDevices();
    }
    return [];
  }

  simulateNewMouse() {
    const deviceId = `test_mouse_${Date.now()}`;
    const testDevice = {
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

  removeDevice(deviceId) {
    if (this.devices.has(deviceId)) {
      const device = this.devices.get(deviceId);
      this.devices.delete(deviceId);

      this.emit('deviceRemoved', device);
    }
  }

  simulateTestMovement() {
    console.log("🎮 Simulation d'un mouvement de test...");
  }
}

module.exports = RawInputMouseDetector;


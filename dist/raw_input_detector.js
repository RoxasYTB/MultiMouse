"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RawInputMouseDetector = void 0;
const events_1 = require("events");
const path = __importStar(require("path"));
class RawInputMouseDetector extends events_1.EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        this.devices = new Map();
        this.messageProcessInterval = null;
        this.rawInputModule = null;
    }
    start() {
        if (this.isActive)
            return true;
        try {
            const modulePath = path.join(__dirname, '..', 'build', 'Release', 'multimouse_raw_input.node');
            this.rawInputModule = require(modulePath);
            this.rawInputModule.setCallbacks(this.handleMouseMove.bind(this), this.handleDeviceChange.bind(this));
            const success = this.rawInputModule.startRawInput();
            if (!success) {
                return false;
            }
            this.isActive = true;
            this.messageProcessInterval = setInterval(() => {
                if (this.rawInputModule) {
                    this.rawInputModule.processMessages();
                }
            }, 16);
            setTimeout(() => {
                this.simulateTestMovement();
            }, 1000);
            this.emit('started');
            return true;
        }
        catch (error) {
            return false;
        }
    }
    stop() {
        if (!this.isActive)
            return;
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
        }
        else {
            actualData = moveData;
        }
        if (!actualData || actualData.deviceHandle === undefined || actualData.deviceHandle === null) {
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
        }
        else {
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
        const mouseData = {
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
    handleDeviceChange(deviceData) {
        const deviceKey = `device_${deviceData.handle}`;
        if (deviceData.action === 'added') {
            if (!this.devices.has(deviceKey)) {
                const device = {
                    id: deviceKey,
                    handle: deviceData.handle,
                    name: deviceData.name,
                    x: deviceData.x || 0,
                    y: deviceData.y || 0,
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
    cleanupInactiveDevices() {
        // Implementation for cleaning up inactive devices
    }
    simulateTestMovement() {
        // Implementation for test movement simulation
    }
}
exports.RawInputMouseDetector = RawInputMouseDetector;
//# sourceMappingURL=raw_input_detector.js.map
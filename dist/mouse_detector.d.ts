import { EventEmitter } from 'events';
import { MouseDevice } from './types';
export declare class MouseDetector extends EventEmitter {
    private devices;
    private lastMouseData;
    private isActive;
    private mouseEventListener;
    private simulatedDeviceId;
    private trackingInterval;
    private deviceScanInterval;
    private detectionThreshold;
    private timeThreshold;
    constructor();
    start(): boolean;
    stop(): void;
    private scanForMouseDevices;
    private addDevice;
    private removeDevice;
    private startMouseTracking;
    private updateMousePositions;
    private updateDevicePosition;
    private updateDeviceDisplay;
    getConnectedDevices(): MouseDevice[];
    getDeviceCount(): number;
    getDeviceInfo(deviceId: string): MouseDevice | null;
    simulateNewMouse(name?: string): string;
    cleanupInactiveDevices(): void;
}
//# sourceMappingURL=mouse_detector.d.ts.map
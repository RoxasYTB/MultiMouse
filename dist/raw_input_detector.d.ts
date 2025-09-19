import { EventEmitter } from 'events';
import { MouseDevice, RawInputModuleInterface } from './types';
export declare class RawInputMouseDetector extends EventEmitter {
    private isActive;
    private devices;
    private messageProcessInterval;
    rawInputModule: RawInputModuleInterface | null;
    constructor();
    start(): boolean;
    stop(): void;
    private handleMouseMove;
    private handleDeviceChange;
    getConnectedDevices(): MouseDevice[];
    getDeviceCount(): number;
    getDeviceInfo(deviceId: string): MouseDevice | null;
    getNativeDevices(): any[];
    simulateNewMouse(): string;
    removeDevice(deviceId: string): void;
    cleanupInactiveDevices(): void;
    private simulateTestMovement;
}
//# sourceMappingURL=raw_input_detector.d.ts.map
export interface MouseDevice {
    id: string;
    handle?: number;
    name: string;
    x: number;
    y: number;
    connected: boolean;
    lastSeen: number;
    totalMovement?: number;
}
export interface MouseMoveData {
    deviceId: string;
    deviceName: string;
    deviceHandle?: number;
    x: number;
    y: number;
    dx?: number;
    dy?: number;
    timestamp: number;
    isRawInput?: boolean;
    isPrimary?: boolean;
    isActive?: boolean;
}
export interface CursorData {
    deviceId: string;
    x: number;
    y: number;
    color?: string;
    cursorType?: string;
    cursorCSS?: string;
    cursorFile?: string;
    isVisible?: boolean;
    id?: string;
    isActive?: boolean;
}
export interface CursorInfo {
    element: HTMLElement;
    data: CursorData;
    cursorType: string;
    cursorCSS: string;
    cursorFile: string;
}
export interface AppConfig {
    sensitivity: number;
    refreshRate: number;
    maxCursors: number;
    cursorSize: number;
    cursorColors: string[];
    highPerformanceMode: boolean;
    precisePositioning: boolean;
}
export interface DeviceChangeData {
    handle: number;
    name: string;
    x?: number;
    y?: number;
    action: 'added' | 'removed';
}
export interface CursorTypeChangeData {
    activeDeviceId: string;
    type: string;
    cssClass: string;
    file: string;
}
export interface CursorVisibilityData {
    cursors: Array<{
        deviceId: string;
        isVisible: boolean;
    }>;
}
export interface CursorInstantUpdateData {
    cursors: CursorData[];
}
export interface RawInputModuleInterface {
    setCallbacks(onMouseMove: (data: any) => void, onDeviceChange: (data: DeviceChangeData) => void): void;
    startRawInput(): boolean;
    stopRawInput(): void;
    processMessages(): void;
    getDevices(): any[];
    setSystemCursorPos?(x: number, y: number): void;
    getSystemCursorPos?(): {
        x: number;
        y: number;
    };
}
declare global {
    interface Window {
        electronAPI?: {
            onCursorsUpdated: (callback: (data: CursorData[]) => void) => void;
            onMouseMove: (callback: (data: MouseMoveData) => void) => void;
            onCursorPositionUpdate: (callback: (data: CursorData) => void) => void;
            onCursorsInstantUpdate: (callback: (data: CursorInstantUpdateData) => void) => void;
            onCursorRemoved: (callback: (deviceId: string) => void) => void;
            onDevicesUpdated: (callback: (data: {
                count: number;
            }) => void) => void;
            onConfigUpdated: (callback: (config: AppConfig) => void) => void;
            onCursorTypeChanged: (callback: (data: CursorTypeChangeData) => void) => void;
            onCursorsVisibilityUpdate: (callback: (data: CursorVisibilityData) => void) => void;
        };
    }
}
//# sourceMappingURL=types.d.ts.map
export declare class CursorTypeDetector {
    private currentCursorType;
    private isDetecting;
    private detectionInterval;
    private callbacks;
    private powershellProcess?;
    private powershellScript;
    private readonly cursorFileMap;
    private readonly cursorCssMap;
    constructor();
    private createPowerShellScript;
    start(): void;
    stop(): void;
    getCurrentCursorType(): string;
    getCursorFile(type?: string): string;
    getCursorCSS(type?: string): string;
    getCursorFilePath(type?: string): string;
    onCursorChange(callback: (newType: string) => void): () => void;
    getCursorInfo(): {
        type: string;
        file: string;
        filePath: string;
        cssClass: string;
        isDetecting: boolean;
    };
}
//# sourceMappingURL=cursor_type_detector.d.ts.map
declare function registerRawInput(targetHwnd?: bigint): void;
declare function processRawInput(hRawInput: bigint): {
    deviceId: string;
    deltaX: number;
    deltaY: number;
} | null;
declare const _default: {
    registerRawInput: typeof registerRawInput;
    processRawInput: typeof processRawInput;
};
export default _default;
//# sourceMappingURL=mouse_input.d.ts.map
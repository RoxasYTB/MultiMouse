"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ffi_napi_1 = require("ffi-napi");
const ref_napi_1 = require("ref-napi");
const ref_struct_napi_1 = __importDefault(require("ref-struct-napi"));
const RAWINPUTHEADER = (0, ref_struct_napi_1.default)({
    dwType: ref_napi_1.types.uint32,
    dwSize: ref_napi_1.types.uint32,
    hDevice: ref_napi_1.types.uint64,
    wParam: ref_napi_1.types.uint64,
});
const RAWMOUSE = (0, ref_struct_napi_1.default)({
    usFlags: ref_napi_1.types.ushort,
    ulButtons: ref_napi_1.types.uint32,
    usButtonFlags: ref_napi_1.types.ushort,
    usButtonData: ref_napi_1.types.ushort,
    ulRawButtons: ref_napi_1.types.uint32,
    lLastX: ref_napi_1.types.int32,
    lLastY: ref_napi_1.types.int32,
    ulExtraInformation: ref_napi_1.types.uint32,
});
const RAWINPUT = (0, ref_struct_napi_1.default)({
    header: typeof RAWINPUTHEADER,
    data: typeof RAWMOUSE,
});
const RAWINPUTDEVICE = (0, ref_struct_napi_1.default)({
    usUsagePage: ref_napi_1.types.ushort,
    usUsage: ref_napi_1.types.ushort,
    dwFlags: ref_napi_1.types.uint32,
    hwndTarget: ref_napi_1.types.uint64,
});
const user32 = (0, ffi_napi_1.Library)('user32', {
    RegisterRawInputDevices: ['bool', ['pointer', 'uint32', 'uint32']],
    GetRawInputData: ['uint32', ['uint64', 'uint32', 'pointer', 'pointer', 'uint32']],
    CreateWindowExA: ['uint64', ['uint32', 'string', 'string', 'uint32', 'int32', 'int32', 'int32', 'int32', 'uint64', 'uint64', 'uint64', 'pointer']],
    DefWindowProcA: ['uint64', ['uint64', 'uint32', 'uint64', 'uint64']],
    GetModuleHandleA: ['uint64', ['string']],
});
const RIDEV_INPUTSINK = 0x00000100;
const RIM_TYPEMOUSE = 0;
const RID_INPUT = 0x10000003;
let hwnd = null;
const deviceMap = new Map();
function createInvisibleWindow() {
    const hInstance = user32.GetModuleHandleA(null);
    hwnd = user32.CreateWindowExA(0, 'STATIC', 'RawInputWindow', 0, 0, 0, 0, 0, BigInt(0), BigInt(0), hInstance, null);
    return hwnd;
}
function registerRawInput(targetHwnd) {
    let actualTargetHwnd = targetHwnd;
    if (!actualTargetHwnd) {
        if (!hwnd) {
            createInvisibleWindow();
        }
        actualTargetHwnd = hwnd;
    }
    const rid = new RAWINPUTDEVICE();
    rid.usUsagePage = 0x01;
    rid.usUsage = 0x02;
    rid.dwFlags = RIDEV_INPUTSINK;
    rid.hwndTarget = actualTargetHwnd;
    const result = user32.RegisterRawInputDevices(rid.ref(), 1, RAWINPUTDEVICE.size);
    if (!result) {
        throw new Error("Erreur lors de l'enregistrement Raw Input");
    }
}
function processRawInput(hRawInput) {
    const headerSize = RAWINPUTHEADER.size;
    const sizePtr = (0, ref_napi_1.alloc)(ref_napi_1.types.uint32);
    user32.GetRawInputData(hRawInput, RID_INPUT, null, sizePtr, headerSize);
    const dataSize = sizePtr.deref();
    const rawData = Buffer.alloc(dataSize);
    user32.GetRawInputData(hRawInput, RID_INPUT, rawData, sizePtr, headerSize);
    const raw = new RAWINPUT(rawData);
    if (raw.header.dwType === RIM_TYPEMOUSE) {
        const hDevice = raw.header.hDevice;
        const deltaX = raw.data.lLastX;
        const deltaY = raw.data.lLastY;
        let deviceId = deviceMap.get(hDevice);
        if (!deviceId) {
            deviceId = `mouse_${deviceMap.size}`;
            deviceMap.set(hDevice, deviceId);
        }
        return {
            deviceId,
            deltaX,
            deltaY,
        };
    }
    return null;
}
exports.default = {
    registerRawInput,
    processRawInput,
};
//# sourceMappingURL=mouse_input.js.map
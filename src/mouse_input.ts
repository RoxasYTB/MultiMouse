import { Library } from 'ffi-napi';
import { alloc, types } from 'ref-napi';
import Struct from 'ref-struct-napi';

const RAWINPUTHEADER = Struct({
  dwType: types.uint32,
  dwSize: types.uint32,
  hDevice: types.uint64,
  wParam: types.uint64,
});

const RAWMOUSE = Struct({
  usFlags: types.ushort,
  ulButtons: types.uint32,
  usButtonFlags: types.ushort,
  usButtonData: types.ushort,
  ulRawButtons: types.uint32,
  lLastX: types.int32,
  lLastY: types.int32,
  ulExtraInformation: types.uint32,
});

const RAWINPUT = Struct({
  header: typeof RAWINPUTHEADER,
  data: typeof RAWMOUSE,
});

const RAWINPUTDEVICE = Struct({
  usUsagePage: types.ushort,
  usUsage: types.ushort,
  dwFlags: types.uint32,
  hwndTarget: types.uint64,
});

interface User32Functions {
  RegisterRawInputDevices: (rid: any, uiNumDevices: number, cbSize: number) => boolean;
  GetRawInputData: (hRawInput: bigint, uiCommand: number, pData: any, pcbSize: any, cbSizeHeader: number) => number;
  CreateWindowExA: (dwExStyle: number, lpClassName: string, lpWindowName: string, dwStyle: number, x: number, y: number, nWidth: number, nHeight: number, hWndParent: bigint, hMenu: bigint, hInstance: bigint, lpParam: any) => bigint;
  DefWindowProcA: (hWnd: bigint, Msg: number, wParam: bigint, lParam: bigint) => bigint;
  GetModuleHandleA: (lpModuleName: string | null) => bigint;
}

const user32: User32Functions = Library('user32', {
  RegisterRawInputDevices: ['bool', ['pointer', 'uint32', 'uint32']],
  GetRawInputData: ['uint32', ['uint64', 'uint32', 'pointer', 'pointer', 'uint32']],
  CreateWindowExA: ['uint64', ['uint32', 'string', 'string', 'uint32', 'int32', 'int32', 'int32', 'int32', 'uint64', 'uint64', 'uint64', 'pointer']],
  DefWindowProcA: ['uint64', ['uint64', 'uint32', 'uint64', 'uint64']],
  GetModuleHandleA: ['uint64', ['string']],
}) as any;

const RIDEV_INPUTSINK = 0x00000100;
const RIM_TYPEMOUSE = 0;
const RID_INPUT = 0x10000003;

let hwnd: bigint | null = null;
const deviceMap = new Map<bigint, string>();

function createInvisibleWindow(): bigint {
  const hInstance = user32.GetModuleHandleA(null);

  hwnd = user32.CreateWindowExA(0, 'STATIC', 'RawInputWindow', 0, 0, 0, 0, 0, BigInt(0), BigInt(0), hInstance, null);

  return hwnd;
}

function registerRawInput(targetHwnd?: bigint): void {
  let actualTargetHwnd = targetHwnd;
  if (!actualTargetHwnd) {
    if (!hwnd) {
      createInvisibleWindow();
    }
    actualTargetHwnd = hwnd!;
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

function processRawInput(hRawInput: bigint): { deviceId: string; deltaX: number; deltaY: number } | null {
  const headerSize = RAWINPUTHEADER.size;

  const sizePtr = alloc(types.uint32);

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

export default {
  registerRawInput,
  processRawInput,
};
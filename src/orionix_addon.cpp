#include <nan.h>
#include <windows.h>
#include <ShellScalingApi.h>
#include <map>
#include <vector>
#include <string>
#include <algorithm>
#include <queue>
#include <mutex>

#pragma comment(lib, "Shcore.lib")

using namespace Nan;

struct MouseEvent {
    HANDLE hDevice;
    std::string deviceName;
    int x, y;
    int deltaX, deltaY;
    int flags;
    std::string type;
    std::string action;
};

struct MouseDevice {
    HANDLE hDevice;
    std::string name;
    int x, y;
};

static std::map<HANDLE, MouseDevice> devices;
static HWND hiddenWindow = nullptr;
static Nan::Persistent<v8::Function> moveCallback;
static Nan::Persistent<v8::Function> deviceCallback;
static std::queue<MouseEvent> eventQueue;
static std::mutex eventMutex;
static int messageCount = 0;
static HCURSOR originalCursor = nullptr;
static HCURSOR transparentCursor = nullptr;
static bool cursorHidden = false;

static HCURSOR originalCursors[10];
static bool cursorsSaved = false;

BOOL WINAPI ConsoleCtrlHandler(DWORD ctrlType) {
    switch (ctrlType) {
        case CTRL_C_EVENT:
        case CTRL_BREAK_EVENT:
        case CTRL_CLOSE_EVENT:
        case CTRL_LOGOFF_EVENT:
        case CTRL_SHUTDOWN_EVENT:

            if (cursorHidden) {

                SystemParametersInfo(SPI_SETCURSORS, 0, NULL, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);

                HCURSOR defaultArrow = LoadCursor(NULL, IDC_ARROW);
                HCURSOR defaultIBeam = LoadCursor(NULL, IDC_IBEAM);
                HCURSOR defaultHand = LoadCursor(NULL, IDC_HAND);
                HCURSOR defaultWait = LoadCursor(NULL, IDC_WAIT);
                HCURSOR defaultCross = LoadCursor(NULL, IDC_CROSS);
                HCURSOR defaultSizeWE = LoadCursor(NULL, IDC_SIZEWE);
                HCURSOR defaultSizeNS = LoadCursor(NULL, IDC_SIZENS);
                HCURSOR defaultSizeNESW = LoadCursor(NULL, IDC_SIZENESW);
                HCURSOR defaultSizeNWSE = LoadCursor(NULL, IDC_SIZENWSE);
                HCURSOR defaultNo = LoadCursor(NULL, IDC_NO);

                if (defaultArrow) SetSystemCursor(CopyCursor(defaultArrow), 32512);
                if (defaultIBeam) SetSystemCursor(CopyCursor(defaultIBeam), 32513);
                if (defaultHand) SetSystemCursor(CopyCursor(defaultHand), 32649);
                if (defaultWait) SetSystemCursor(CopyCursor(defaultWait), 32514);
                if (defaultCross) SetSystemCursor(CopyCursor(defaultCross), 32515);
                if (defaultSizeWE) SetSystemCursor(CopyCursor(defaultSizeWE), 32644);
                if (defaultSizeNS) SetSystemCursor(CopyCursor(defaultSizeNS), 32645);
                if (defaultSizeNESW) SetSystemCursor(CopyCursor(defaultSizeNESW), 32642);
                if (defaultSizeNWSE) SetSystemCursor(CopyCursor(defaultSizeNWSE), 32643);
                if (defaultNo) SetSystemCursor(CopyCursor(defaultNo), 32648);

                SystemParametersInfo(SPI_SETCURSORS, 0, NULL, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
                SendMessage(HWND_BROADCAST, WM_SETTINGCHANGE, SPI_SETCURSORS, 0);

                ShowCursor(TRUE);
                cursorHidden = false;
            }
            return FALSE;
    }
    return FALSE;
}

std::string GetDeviceName(HANDLE hDevice) {
    UINT nameSize;
    GetRawInputDeviceInfo(hDevice, RIDI_DEVICENAME, nullptr, &nameSize);

    if (nameSize > 0) {
        std::vector<WCHAR> name(nameSize);
        if (GetRawInputDeviceInfo(hDevice, RIDI_DEVICENAME, &name[0], &nameSize) > 0) {
            std::wstring devicePath(&name[0]);

            std::string cleanPath;
            for (wchar_t wc : devicePath) {
                if (wc >= 32 && wc <= 126) {
                    cleanPath += (char)wc;
                }
            }

            if (cleanPath.find("HID") != std::string::npos) {
                if (cleanPath.find("VID_046D") != std::string::npos) {
                    return "Logitech Mouse";
                } else if (cleanPath.find("VID_1532") != std::string::npos) {
                    return "Razer Mouse";
                } else if (cleanPath.find("VID_045E") != std::string::npos) {
                    return "Microsoft Mouse";
                } else if (cleanPath.find("TouchPad") != std::string::npos || cleanPath.find("trackpad") != std::string::npos) {
                    return "Trackpad";
                } else {
                    return "USB Mouse";
                }
            } else if (cleanPath.find("PS2") != std::string::npos) {
                return "PS/2 Mouse";
            } else if (cleanPath.find("Synaptics") != std::string::npos || cleanPath.find("TouchPad") != std::string::npos) {
                return "Trackpad";
            } else {
                return "Generic Mouse";
            }
        }
    }
    return "Unknown Device";
}

HCURSOR CreateTransparentCursor() {

    const int width = 1;
    const int height = 1;

    BYTE andMask[1] = { 0xFF };
    BYTE xorMask[1] = { 0x00 };

    return CreateCursor(
        GetModuleHandle(nullptr),
        0,
        0,
        width,
        height,
        andMask,
        xorMask
    );
}

LRESULT CALLBACK RawInputWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
        case WM_INPUT: {
            messageCount++;

            UINT dwSize;
            GetRawInputData((HRAWINPUT)lParam, RID_INPUT, nullptr, &dwSize, sizeof(RAWINPUTHEADER));

            std::vector<BYTE> buffer(dwSize);
            if (GetRawInputData((HRAWINPUT)lParam, RID_INPUT, &buffer[0], &dwSize, sizeof(RAWINPUTHEADER)) == dwSize) {
                RAWINPUT* raw = (RAWINPUT*)&buffer[0];

                if (raw->header.dwType == RIM_TYPEMOUSE) {
                    HANDLE hDevice = raw->header.hDevice;

                    if (devices.find(hDevice) == devices.end()) {
                        MouseDevice device;
                        device.hDevice = hDevice;
                        device.name = GetDeviceName(hDevice);
                        device.x = GetSystemMetrics(SM_CXSCREEN) / 2;
                        device.y = GetSystemMetrics(SM_CYSCREEN) / 2;
                        devices[hDevice] = device;

                        MouseEvent event;
                        event.hDevice = hDevice;
                        event.deviceName = device.name;
                        event.x = device.x;
                        event.y = device.y;
                        event.deltaX = 0;
                        event.deltaY = 0;
                        event.flags = 0;
                        event.type = "device";
                        event.action = "added";

                        std::lock_guard<std::mutex> lock(eventMutex);
                        eventQueue.push(event);
                    }

                    if (raw->data.mouse.lLastX != 0 || raw->data.mouse.lLastY != 0) {
                        auto& device = devices[hDevice];

                        POINT cursorPos;
                        if (GetCursorPos(&cursorPos)) {
                            device.x = cursorPos.x;
                            device.y = cursorPos.y;
                        } else {

                            device.x += raw->data.mouse.lLastX;
                            device.y += raw->data.mouse.lLastY;

                            device.x = std::max(0, std::min(device.x, GetSystemMetrics(SM_CXSCREEN) - 1));
                            device.y = std::max(0, std::min(device.y, (GetSystemMetrics(SM_CYSCREEN) - 1)));
                        }

                        MouseEvent event;
                        event.hDevice = hDevice;
                        event.deviceName = device.name;
                        event.x = device.x;
                        event.y = device.y;
                        event.deltaX = raw->data.mouse.lLastX;
                        event.deltaY = raw->data.mouse.lLastY;
                        event.flags = raw->data.mouse.usFlags;
                        event.type = "move";
                        event.action = "";

                        std::lock_guard<std::mutex> lock(eventMutex);
                        eventQueue.push(event);
                    }
                }
            }
            break;
        }
        case WM_INPUT_DEVICE_CHANGE: {
            HANDLE hDevice = (HANDLE)lParam;
            if (wParam == GIDC_REMOVAL) {

                std::string deviceName = "Unknown";
                auto it = devices.find(hDevice);
                if (it != devices.end()) {
                    deviceName = it->second.name;
                    devices.erase(it);
                }

                MouseEvent event;
                event.hDevice = hDevice;
                event.deviceName = deviceName;
                event.x = 0;
                event.y = 0;
                event.deltaX = 0;
                event.deltaY = 0;
                event.flags = 0;
                event.type = "device";
                event.action = "removed";

                std::lock_guard<std::mutex> lock(eventMutex);
                eventQueue.push(event);
            }
            break;
        }
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

NAN_METHOD(SetCallbacks) {
    if (info.Length() < 2) {
        Nan::ThrowTypeError("Expected 2 arguments: (mouseMoveCallback, deviceChangeCallback)");
        return;
    }

    if (!info[0]->IsFunction() || !info[1]->IsFunction()) {
        Nan::ThrowTypeError("Both arguments must be functions");
        return;
    }

    moveCallback.Reset(v8::Local<v8::Function>::Cast(info[0]));
    deviceCallback.Reset(v8::Local<v8::Function>::Cast(info[1]));
}

NAN_METHOD(StartRawInput) {

    WNDCLASSA wc = {};
    wc.lpfnWndProc = RawInputWndProc;
    wc.hInstance = GetModuleHandle(nullptr);
    wc.lpszClassName = "OrionixRawInput";

    if (!RegisterClassA(&wc)) {
        DWORD error = GetLastError();
        if (error != ERROR_CLASS_ALREADY_EXISTS) {

            Nan::ThrowError("Failed to register window class");
            return;
        } else {

        }
    }

    hiddenWindow = CreateWindowExA(
        0,
        "OrionixRawInput",
        "Hidden",
        WS_POPUP,
        -32000, -32000, 1, 1,
        nullptr,
        nullptr,
        GetModuleHandle(nullptr),
        nullptr
    );

    if (!hiddenWindow) {
        DWORD error = GetLastError();

        Nan::ThrowError("Failed to create hidden window");
        return;
    } else {

    }

    RAWINPUTDEVICE rid[1];
    rid[0].usUsagePage = 0x01;
    rid[0].usUsage = 0x02;
    rid[0].dwFlags = RIDEV_INPUTSINK;
    rid[0].hwndTarget = hiddenWindow;

    if (!RegisterRawInputDevices(rid, 1, sizeof(rid[0]))) {
        DWORD error = GetLastError();

        Nan::ThrowError("Failed to register raw input devices");
        return;
    } else {

    }

    if (!SetConsoleCtrlHandler(ConsoleCtrlHandler, TRUE)) {

    }

    info.GetReturnValue().Set(Nan::New<v8::Boolean>(true));
}

NAN_METHOD(StopRawInput) {
    if (hiddenWindow) {
        DestroyWindow(hiddenWindow);
        hiddenWindow = nullptr;
    }

    RAWINPUTDEVICE rid[1];
    rid[0].usUsagePage = 0x01;
    rid[0].usUsage = 0x02;
    rid[0].dwFlags = RIDEV_REMOVE;
    rid[0].hwndTarget = nullptr;

    RegisterRawInputDevices(rid, 1, sizeof(rid[0]));

    info.GetReturnValue().Set(Nan::New<v8::Boolean>(true));
}

NAN_METHOD(SetSystemCursorPos) {
    if (info.Length() < 2) {
        Nan::ThrowTypeError("Expected 2 arguments: (x, y)");
        return;
    }

    int x = Nan::To<int32_t>(info[0]).FromJust();
    int y = Nan::To<int32_t>(info[1]).FromJust();

    int virtualScreenLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int virtualScreenTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int virtualScreenWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int virtualScreenHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);

    int virtualScreenRight = virtualScreenLeft + virtualScreenWidth - 1;
    int virtualScreenBottom = virtualScreenTop + virtualScreenHeight - 1;

    x = std::max(virtualScreenLeft, std::min(x, virtualScreenRight));
    y = std::max(virtualScreenTop, std::min(y, virtualScreenBottom));

    bool success = SetCursorPos(x, y);
    info.GetReturnValue().Set(Nan::New<v8::Boolean>(success));
}

NAN_METHOD(GetSystemCursorPos) {
    POINT cursorPos;
    if (GetCursorPos(&cursorPos)) {
        v8::Local<v8::Object> position = Nan::New<v8::Object>();
        Nan::Set(position, Nan::New("x").ToLocalChecked(), Nan::New<v8::Number>(cursorPos.x));
        Nan::Set(position, Nan::New("y").ToLocalChecked(), Nan::New<v8::Number>(cursorPos.y));
        info.GetReturnValue().Set(position);
    } else {
        info.GetReturnValue().Set(Nan::Null());
    }
}

NAN_METHOD(GetMessageCount) {
    info.GetReturnValue().Set(Nan::New<v8::Number>(messageCount));
}

NAN_METHOD(SimulateMouseMove) {
    if (info.Length() < 3) {
        Nan::ThrowTypeError("Expected 3 arguments: (dx, dy, deviceHandle)");
        return;
    }

    int dx = Nan::To<int32_t>(info[0]).FromJust();
    int dy = Nan::To<int32_t>(info[1]).FromJust();
    HANDLE hDevice = (HANDLE)(uintptr_t)Nan::To<uint32_t>(info[2]).FromJust();

    MouseEvent event;
    event.hDevice = hDevice;
    event.deviceName = "Simulated Mouse";
    event.x = 500 + dx;
    event.y = 500 + dy;
    event.deltaX = dx;
    event.deltaY = dy;
    event.flags = 0;
    event.type = "move";
    event.action = "";

    std::lock_guard<std::mutex> lock(eventMutex);
    eventQueue.push(event);

    info.GetReturnValue().Set(Nan::New<v8::Boolean>(true));
}

NAN_METHOD(GetDevices) {
    UINT numDevices;
    if (GetRawInputDeviceList(nullptr, &numDevices, sizeof(RAWINPUTDEVICELIST)) != 0) {
        Nan::ThrowError("Failed to get device count");
        return;
    }

    std::vector<RAWINPUTDEVICELIST> deviceList(numDevices);
    if (GetRawInputDeviceList(&deviceList[0], &numDevices, sizeof(RAWINPUTDEVICELIST)) == (UINT)-1) {
        Nan::ThrowError("Failed to get device list");
        return;
    }

    v8::Local<v8::Array> result = New<v8::Array>();
    int mouseIndex = 0;

    for (UINT i = 0; i < numDevices; i++) {
        if (deviceList[i].dwType == RIM_TYPEMOUSE) {
            v8::Local<v8::Object> deviceObj = New<v8::Object>();
            std::string deviceName = GetDeviceName(deviceList[i].hDevice);

            Nan::Set(deviceObj, Nan::New("id").ToLocalChecked(), Nan::New<v8::Number>(mouseIndex));
            Nan::Set(deviceObj, Nan::New("name").ToLocalChecked(), Nan::New(deviceName.c_str()).ToLocalChecked());
            Nan::Set(deviceObj, Nan::New("handle").ToLocalChecked(), Nan::New<v8::Number>((double)(uintptr_t)deviceList[i].hDevice));
            Nan::Set(deviceObj, Nan::New("type").ToLocalChecked(), Nan::New("mouse").ToLocalChecked());
            Nan::Set(deviceObj, Nan::New("x").ToLocalChecked(), Nan::New<v8::Number>(0));

            Nan::Set(result, mouseIndex, deviceObj);
            mouseIndex++;
        }
    }

    info.GetReturnValue().Set(result);
}

NAN_METHOD(ProcessMessages) {
    MSG msg;
    int count = 0;

    while (count < 10 && PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
        count++;
    }

    std::queue<MouseEvent> localQueue;
    {
        std::lock_guard<std::mutex> lock(eventMutex);
        localQueue.swap(eventQueue);
    }

    while (!localQueue.empty()) {
        MouseEvent event = localQueue.front();
        localQueue.pop();

        Nan::HandleScope scope;

        if (event.type == "move" && !moveCallback.IsEmpty()) {
            v8::Local<v8::Function> callback = New(moveCallback);
            v8::Local<v8::Object> eventObj = New<v8::Object>();

            Nan::Set(eventObj, Nan::New("deviceHandle").ToLocalChecked(), Nan::New<v8::Number>((double)(uintptr_t)event.hDevice));
            Nan::Set(eventObj, Nan::New("deviceName").ToLocalChecked(), Nan::New(event.deviceName.c_str()).ToLocalChecked());
            Nan::Set(eventObj, Nan::New("x").ToLocalChecked(), Nan::New<v8::Number>(event.x));
            Nan::Set(eventObj, Nan::New("y").ToLocalChecked(), Nan::New<v8::Number>(event.y));
            Nan::Set(eventObj, Nan::New("dx").ToLocalChecked(), Nan::New<v8::Number>(event.deltaX));
            Nan::Set(eventObj, Nan::New("dy").ToLocalChecked(), Nan::New<v8::Number>(event.deltaY));
            Nan::Set(eventObj, Nan::New("flags").ToLocalChecked(), Nan::New<v8::Number>(event.flags));

            v8::Local<v8::Value> argv[] = { eventObj };
            Nan::Call(callback, Nan::GetCurrentContext()->Global(), 1, argv);

        } else if (event.type == "device" && !deviceCallback.IsEmpty()) {
            v8::Local<v8::Function> callback = New(deviceCallback);
            v8::Local<v8::Object> deviceObj = New<v8::Object>();

            Nan::Set(deviceObj, Nan::New("action").ToLocalChecked(), Nan::New(event.action.c_str()).ToLocalChecked());
            Nan::Set(deviceObj, Nan::New("handle").ToLocalChecked(), Nan::New<v8::Number>((double)(uintptr_t)event.hDevice));
            Nan::Set(deviceObj, Nan::New("name").ToLocalChecked(), Nan::New(event.deviceName.c_str()).ToLocalChecked());
            Nan::Set(deviceObj, Nan::New("x").ToLocalChecked(), Nan::New<v8::Number>(event.x));
            Nan::Set(deviceObj, Nan::New("y").ToLocalChecked(), Nan::New<v8::Number>(event.y));

            v8::Local<v8::Value> argv[] = { deviceObj };
            Nan::Call(callback, Nan::GetCurrentContext()->Global(), 1, argv);
        }

        count++;
    }

    info.GetReturnValue().Set(Nan::New<v8::Number>(count));
}

NAN_METHOD(HideSystemCursor) {
    if (!cursorHidden) {

        originalCursor = GetCursor();

        if (!transparentCursor) {
            transparentCursor = CreateTransparentCursor();
        }

        if (transparentCursor) {

            if (!cursorsSaved) {
                originalCursors[0] = LoadCursor(NULL, IDC_ARROW);
                originalCursors[1] = LoadCursor(NULL, IDC_IBEAM);
                originalCursors[2] = LoadCursor(NULL, IDC_HAND);
                originalCursors[3] = LoadCursor(NULL, IDC_WAIT);
                originalCursors[4] = LoadCursor(NULL, IDC_CROSS);
                originalCursors[5] = LoadCursor(NULL, IDC_SIZEWE);
                originalCursors[6] = LoadCursor(NULL, IDC_SIZENS);
                originalCursors[7] = LoadCursor(NULL, IDC_SIZENESW);
                originalCursors[8] = LoadCursor(NULL, IDC_SIZENWSE);
                originalCursors[9] = LoadCursor(NULL, IDC_NO);
                cursorsSaved = true;
            }

            Sleep(5000);

            SetSystemCursor(CopyCursor(transparentCursor), 32512);
            SetSystemCursor(CopyCursor(transparentCursor), 32513);
            SetSystemCursor(CopyCursor(transparentCursor), 32649);
            SetSystemCursor(CopyCursor(transparentCursor), 32514);
            SetSystemCursor(CopyCursor(transparentCursor), 32515);
            SetSystemCursor(CopyCursor(transparentCursor), 32644);
            SetSystemCursor(CopyCursor(transparentCursor), 32645);
            SetSystemCursor(CopyCursor(transparentCursor), 32642);
            SetSystemCursor(CopyCursor(transparentCursor), 32643);
            SetSystemCursor(CopyCursor(transparentCursor), 32648);

            int cursorCount = ShowCursor(FALSE);
            while (cursorCount >= 0) {
                cursorCount = ShowCursor(FALSE);
            }

            cursorHidden = true;
            info.GetReturnValue().Set(Nan::New<v8::Boolean>(true));
        } else {
            info.GetReturnValue().Set(Nan::New<v8::Boolean>(false));
        }
    } else {
        info.GetReturnValue().Set(Nan::New<v8::Boolean>(true));
    }
}

NAN_METHOD(ShowSystemCursor) {
    if (cursorHidden) {

        SystemParametersInfo(SPI_SETCURSORS, 0, NULL, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);

        HCURSOR defaultArrow = LoadCursor(NULL, IDC_ARROW);
        HCURSOR defaultIBeam = LoadCursor(NULL, IDC_IBEAM);
        HCURSOR defaultHand = LoadCursor(NULL, IDC_HAND);
        HCURSOR defaultWait = LoadCursor(NULL, IDC_WAIT);
        HCURSOR defaultCross = LoadCursor(NULL, IDC_CROSS);
        HCURSOR defaultSizeWE = LoadCursor(NULL, IDC_SIZEWE);
        HCURSOR defaultSizeNS = LoadCursor(NULL, IDC_SIZENS);
        HCURSOR defaultSizeNESW = LoadCursor(NULL, IDC_SIZENESW);
        HCURSOR defaultSizeNWSE = LoadCursor(NULL, IDC_SIZENWSE);
        HCURSOR defaultNo = LoadCursor(NULL, IDC_NO);

        if (defaultArrow) SetSystemCursor(CopyCursor(defaultArrow), 32512);
        if (defaultIBeam) SetSystemCursor(CopyCursor(defaultIBeam), 32513);
        if (defaultHand) SetSystemCursor(CopyCursor(defaultHand), 32649);
        if (defaultWait) SetSystemCursor(CopyCursor(defaultWait), 32514);
        if (defaultCross) SetSystemCursor(CopyCursor(defaultCross), 32515);
        if (defaultSizeWE) SetSystemCursor(CopyCursor(defaultSizeWE), 32644);
        if (defaultSizeNS) SetSystemCursor(CopyCursor(defaultSizeNS), 32645);
        if (defaultSizeNESW) SetSystemCursor(CopyCursor(defaultSizeNESW), 32642);
        if (defaultSizeNWSE) SetSystemCursor(CopyCursor(defaultSizeNWSE), 32643);
        if (defaultNo) SetSystemCursor(CopyCursor(defaultNo), 32648);

        SystemParametersInfo(SPI_SETCURSORS, 0, NULL, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);

        SendMessage(HWND_BROADCAST, WM_SETTINGCHANGE, SPI_SETCURSORS, 0);

        InvalidateRect(NULL, NULL, TRUE);
        UpdateWindow(GetDesktopWindow());

        int cursorCount = ShowCursor(TRUE);
        while (cursorCount < 0) {
            cursorCount = ShowCursor(TRUE);
        }

        cursorHidden = false;
        info.GetReturnValue().Set(Nan::New<v8::Boolean>(true));
    } else {
        info.GetReturnValue().Set(Nan::New<v8::Boolean>(false));
    }
}

NAN_METHOD(GetCursorState) {
    CURSORINFO cursorInfo;
    cursorInfo.cbSize = sizeof(CURSORINFO);

    if (GetCursorInfo(&cursorInfo)) {
        v8::Local<v8::Object> result = Nan::New<v8::Object>();

        std::string cursorType = "unknown";
        HCURSOR currentCursor = cursorInfo.hCursor;

        if (currentCursor == LoadCursor(NULL, IDC_ARROW)) {
            cursorType = "arrow";
        } else if (currentCursor == LoadCursor(NULL, IDC_IBEAM)) {
            cursorType = "ibeam";
        } else if (currentCursor == LoadCursor(NULL, IDC_HAND)) {
            cursorType = "hand";
        } else if (currentCursor == LoadCursor(NULL, IDC_WAIT)) {
            cursorType = "wait";
        } else if (currentCursor == LoadCursor(NULL, IDC_CROSS)) {
            cursorType = "cross";
        } else if (currentCursor == LoadCursor(NULL, IDC_SIZEWE)) {
            cursorType = "resize-ew";
        } else if (currentCursor == LoadCursor(NULL, IDC_SIZENS)) {
            cursorType = "resize-ns";
        } else if (currentCursor == LoadCursor(NULL, IDC_SIZENESW)) {
            cursorType = "resize-nesw";
        } else if (currentCursor == LoadCursor(NULL, IDC_SIZENWSE)) {
            cursorType = "resize-nwse";
        } else if (currentCursor == LoadCursor(NULL, IDC_NO)) {
            cursorType = "not-allowed";
        } else if (!cursorHidden) {

            cursorType = "system";
        } else {

            cursorType = "hidden";
        }

        Nan::Set(result, Nan::New("type").ToLocalChecked(), Nan::New(cursorType.c_str()).ToLocalChecked());
        Nan::Set(result, Nan::New("visible").ToLocalChecked(), Nan::New<v8::Boolean>(!cursorHidden));
        Nan::Set(result, Nan::New("x").ToLocalChecked(), Nan::New<v8::Number>(cursorInfo.ptScreenPos.x));
        Nan::Set(result, Nan::New("y").ToLocalChecked(), Nan::New<v8::Number>(cursorInfo.ptScreenPos.y));

        info.GetReturnValue().Set(result);
    } else {
        info.GetReturnValue().Set(Nan::Null());
    }
}

NAN_METHOD(EmergencyRestoreCursors) {

    SystemParametersInfo(SPI_SETCURSORS, 0, NULL, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);

    HCURSOR defaultArrow = LoadCursor(NULL, IDC_ARROW);
    HCURSOR defaultIBeam = LoadCursor(NULL, IDC_IBEAM);
    HCURSOR defaultHand = LoadCursor(NULL, IDC_HAND);
    HCURSOR defaultWait = LoadCursor(NULL, IDC_WAIT);
    HCURSOR defaultCross = LoadCursor(NULL, IDC_CROSS);
    HCURSOR defaultSizeWE = LoadCursor(NULL, IDC_SIZEWE);
    HCURSOR defaultSizeNS = LoadCursor(NULL, IDC_SIZENS);
    HCURSOR defaultSizeNESW = LoadCursor(NULL, IDC_SIZENESW);
    HCURSOR defaultSizeNWSE = LoadCursor(NULL, IDC_SIZENWSE);
    HCURSOR defaultNo = LoadCursor(NULL, IDC_NO);

    if (defaultArrow) SetSystemCursor(CopyCursor(defaultArrow), 32512);
    if (defaultIBeam) SetSystemCursor(CopyCursor(defaultIBeam), 32513);
    if (defaultHand) SetSystemCursor(CopyCursor(defaultHand), 32649);
    if (defaultWait) SetSystemCursor(CopyCursor(defaultWait), 32514);
    if (defaultCross) SetSystemCursor(CopyCursor(defaultCross), 32515);
    if (defaultSizeWE) SetSystemCursor(CopyCursor(defaultSizeWE), 32644);
    if (defaultSizeNS) SetSystemCursor(CopyCursor(defaultSizeNS), 32645);
    if (defaultSizeNESW) SetSystemCursor(CopyCursor(defaultSizeNESW), 32642);
    if (defaultSizeNWSE) SetSystemCursor(CopyCursor(defaultSizeNWSE), 32643);
    if (defaultNo) SetSystemCursor(CopyCursor(defaultNo), 32648);

    SystemParametersInfo(SPI_SETCURSORS, 0, NULL, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
    SendMessage(HWND_BROADCAST, WM_SETTINGCHANGE, SPI_SETCURSORS, 0);
    InvalidateRect(NULL, NULL, TRUE);
    UpdateWindow(GetDesktopWindow());

    int cursorCount = 0;
    do {
        cursorCount = ShowCursor(TRUE);
    } while (cursorCount < 0);

    cursorHidden = false;
    info.GetReturnValue().Set(Nan::New<v8::Boolean>(true));
}

NAN_METHOD(SetupShutdownHandler) {

    BOOL result = SetConsoleCtrlHandler(ConsoleCtrlHandler, TRUE);
    info.GetReturnValue().Set(Nan::New<v8::Boolean>(result));
}

NAN_METHOD(SetWindowTopMost) {
    if (info.Length() < 1) {
        Nan::ThrowError("Expected window handle as argument");
        return;
    }

    v8::Local<v8::Object> bufferObj = info[0].As<v8::Object>();
    char* bufferData = node::Buffer::Data(bufferObj);
    HWND hwnd = *reinterpret_cast<HWND*>(bufferData);

    if (!hwnd || !IsWindow(hwnd)) {
        info.GetReturnValue().Set(Nan::New<v8::Boolean>(false));
        return;
    }

    BOOL result = SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE
    );

    if (result) {

        LONG_PTR exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
        exStyle |= WS_EX_TOPMOST | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW;
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, exStyle);

        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED
        );
    }

    info.GetReturnValue().Set(Nan::New<v8::Boolean>(result));
}

NAN_METHOD(KeepWindowTopMost) {
    if (info.Length() < 1) {
        Nan::ThrowError("Expected window handle as argument");
        return;
    }

    v8::Local<v8::Object> bufferObj = info[0].As<v8::Object>();
    char* bufferData = node::Buffer::Data(bufferObj);
    HWND hwnd = *reinterpret_cast<HWND*>(bufferData);

    if (!hwnd || !IsWindow(hwnd)) {
        info.GetReturnValue().Set(Nan::New<v8::Boolean>(false));
        return;
    }

    BOOL result = SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
    );

    info.GetReturnValue().Set(Nan::New<v8::Boolean>(result));
}

NAN_MODULE_INIT(Init) {
    Nan::Set(target, Nan::New("setCallbacks").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(SetCallbacks)).ToLocalChecked());

    Nan::Set(target, Nan::New("startRawInput").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(StartRawInput)).ToLocalChecked());

    Nan::Set(target, Nan::New("stopRawInput").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(StopRawInput)).ToLocalChecked());

    Nan::Set(target, Nan::New("getDevices").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(GetDevices)).ToLocalChecked());

    Nan::Set(target, Nan::New("processMessages").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(ProcessMessages)).ToLocalChecked());

    Nan::Set(target, Nan::New("getMessageCount").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(GetMessageCount)).ToLocalChecked());

    Nan::Set(target, Nan::New("simulateMouseMove").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(SimulateMouseMove)).ToLocalChecked());

    Nan::Set(target, Nan::New("setSystemCursorPos").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(SetSystemCursorPos)).ToLocalChecked());

    Nan::Set(target, Nan::New("getSystemCursorPos").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(GetSystemCursorPos)).ToLocalChecked());

    Nan::Set(target, Nan::New("hideSystemCursor").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(HideSystemCursor)).ToLocalChecked());

    Nan::Set(target, Nan::New("showSystemCursor").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(ShowSystemCursor)).ToLocalChecked());

    Nan::Set(target, Nan::New("getCursorState").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(GetCursorState)).ToLocalChecked());

    Nan::Set(target, Nan::New("emergencyRestoreCursors").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(EmergencyRestoreCursors)).ToLocalChecked());

    Nan::Set(target, Nan::New("setupShutdownHandler").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(SetupShutdownHandler)).ToLocalChecked());

    Nan::Set(target, Nan::New("setWindowTopMost").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(SetWindowTopMost)).ToLocalChecked());

    Nan::Set(target, Nan::New("keepWindowTopMost").ToLocalChecked(),
        Nan::GetFunction(Nan::New<v8::FunctionTemplate>(KeepWindowTopMost)).ToLocalChecked());
}

NODE_MODULE(Orionix_raw_input, Init)



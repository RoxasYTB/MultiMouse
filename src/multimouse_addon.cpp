#include <nan.h>
#include <windows.h>
#include <map>
#include <vector>
#include <string>
#include <algorithm>
#include <queue>
#include <mutex>

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
    wc.lpszClassName = "MultimouseRawInput";

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
        "MultimouseRawInput",
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

    x = std::max(0, std::min(x, GetSystemMetrics(SM_CXSCREEN) - 1));
    y = std::max(0, std::min(y, GetSystemMetrics(SM_CYSCREEN) - 1));

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
}

NODE_MODULE(multimouse_raw_input, Init)



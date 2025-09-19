import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';

export class CursorTypeDetector {
  private currentCursorType: string = 'Arrow';
  private isDetecting: boolean = false;
  private detectionInterval: NodeJS.Timeout | null = null;
  private callbacks: Set<(newType: string) => void> = new Set();
  private powershellProcess?: ChildProcess;
  private powershellScript: string;

  private readonly cursorFileMap: Record<string, string> = {
    Arrow: 'aero_arrow.cur',
    AppStarting: 'aero_working.ani',
    Wait: 'aero_busy.ani',
    Hand: 'aero_link.cur',
    Help: 'aero_helpsel.cur',
    IBeam: 'aero_ibeam.cur',
    Cross: 'cross.cur',
    No: 'aero_unavail.cur',
    SizeNS: 'aero_ns.cur',
    SizeWE: 'aero_ew.cur',
    SizeNWSE: 'aero_nwse.cur',
    SizeNESW: 'aero_nesw.cur',
    SizeAll: 'aero_move.cur',
    UpArrow: 'aero_up.cur',
    Pen: 'aero_pen.cur',
    Person: 'aero_person.cur',
    Pin: 'aero_pin.cur',
  };

  private readonly cursorCssMap: Record<string, string> = {
    Arrow: 'default',
    Hand: 'pointer',
    IBeam: 'text',
    Wait: 'wait',
    AppStarting: 'progress',
    Help: 'help',
    Cross: 'crosshair',
    No: 'not-allowed',
    SizeNS: 'ns-resize',
    SizeWE: 'ew-resize',
    SizeNWSE: 'nwse-resize',
    SizeNESW: 'nesw-resize',
    SizeAll: 'move',
    UpArrow: 'default',
    Pen: 'default',
    Person: 'default',
    Pin: 'default',
  };

  constructor() {
    this.powershellScript = this.createPowerShellScript();
  }

  private createPowerShellScript(): string {
    return `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class CursorInfo {
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct CURSORINFO {
        public int cbSize;
        public int flags;
        public IntPtr hCursor;
        public POINT ptScreenPos;
    }

    [DllImport("user32.dll")]
    public static extern bool GetCursorInfo(ref CURSORINFO pci);

    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern IntPtr LoadCursor(IntPtr hInstance, int lpCursorName);

    public const int CURSOR_SHOWING = 0x00000001;

    public const int IDC_ARROW = 32512;
    public const int IDC_IBEAM = 32513;
    public const int IDC_WAIT = 32514;
    public const int IDC_CROSS = 32515;
    public const int IDC_UPARROW = 32516;
    public const int IDC_SIZENWSE = 32642;
    public const int IDC_SIZENESW = 32643;
    public const int IDC_SIZEWE = 32644;
    public const int IDC_SIZENS = 32645;
    public const int IDC_SIZEALL = 32646;
    public const int IDC_NO = 32648;
    public const int IDC_HAND = 32649;
    public const int IDC_APPSTARTING = 32650;
    public const int IDC_HELP = 32651;
}
"@

function Get-CursorType {
    try {
        $info = New-Object CursorInfo+CURSORINFO
        $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
        $result = [CursorInfo]::GetCursorInfo([ref]$info)

        if (-not $result -or $info.flags -ne [CursorInfo]::CURSOR_SHOWING) {
            return "Hidden"
        }

        $hCur = $info.hCursor

        $map = @{
            Arrow      = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_ARROW)
            IBeam      = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_IBEAM)
            Wait       = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_WAIT)
            Cross      = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_CROSS)
            Hand       = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_HAND)
            SizeWE     = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_SIZEWE)
            SizeNS     = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_SIZENS)
            SizeNWSE   = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_SIZENWSE)
            SizeNESW   = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_SIZENESW)
            SizeAll    = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_SIZEALL)
            Help       = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_HELP)
            UpArrow    = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_UPARROW)
            AppStarting = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_APPSTARTING)
            No         = [CursorInfo]::LoadCursor([IntPtr]::Zero, [CursorInfo]::IDC_NO)
        }

        foreach ($k in $map.Keys) {
            if ($hCur -eq $map[$k]) {
                return $k
            }
        }
        return "Custom"
    } catch {
        return "Error"
    }
}

# Boucle principale de détection optimisée pour performance maximale
while ($true) {
    $cursorType = Get-CursorType
    Write-Output $cursorType
    # Réduction de l'intervalle à 1ms pour détection ultra-rapide
    Start-Sleep -Milliseconds 1
}
`;
  }

  public start(): void {
    if (this.isDetecting) {
      return;
    }

    try {
      this.isDetecting = true;

      this.powershellProcess = spawn('powershell.exe', ['-Command', this.powershellScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let buffer = '';
      this.powershellProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const output = line.trim();
          if (output && output !== this.currentCursorType && output !== '') {
            this.currentCursorType = output;

            for (const callback of this.callbacks) {
              callback(output);
            }
          }
        }
      });

      this.powershellProcess.stderr?.on('data', () => {});

      this.powershellProcess.on('close', (code: number | null) => {
        if (code !== 0) {
        }
        this.isDetecting = false;
      });

      this.powershellProcess.on('error', () => {
        this.isDetecting = false;
      });
    } catch (error) {
      this.isDetecting = false;
    }
  }

  public stop(): void {
    if (!this.isDetecting) {
      return;
    }

    this.isDetecting = false;

    if (this.powershellProcess) {
      this.powershellProcess.kill();
      this.powershellProcess = undefined;
    }

    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  public getCurrentCursorType(): string {
    return this.currentCursorType;
  }

  public getCursorFile(type?: string): string {
    const cursorType = type || this.currentCursorType;
    return this.cursorFileMap[cursorType] || 'aero_arrow.cur';
  }

  public getCursorCSS(type?: string): string {
    const cursorType = type || this.currentCursorType;
    return this.cursorCssMap[cursorType] || 'default';
  }

  public getCursorFilePath(type?: string): string {
    const cursorFile = this.getCursorFile(type);
    return path.join('C:', 'Windows', 'Cursors', cursorFile);
  }

  public onCursorChange(callback: (newType: string) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  public getCursorInfo(): {
    type: string;
    file: string;
    filePath: string;
    cssClass: string;
    isDetecting: boolean;
  } {
    return {
      type: this.currentCursorType,
      file: this.getCursorFile(),
      filePath: this.getCursorFilePath(),
      cssClass: this.getCursorCSS(),
      isDetecting: this.isDetecting,
    };
  }
}



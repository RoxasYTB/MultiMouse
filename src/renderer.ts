import { ipcRenderer } from 'electron';
import { 
  AppConfig, 
  CursorData, 
  CursorInfo, 
  MouseMoveData, 
  CursorTypeChangeData, 
  CursorVisibilityData, 
  CursorInstantUpdateData 
} from './types';

class MultimouseRenderer {
  private cursors: Map<string, CursorInfo> = new Map();
  private config: AppConfig | null = null;
  private cursorsContainer: HTMLElement;
  private sensitivityValue: HTMLElement;
  private activeCursors: HTMLElement;
  private deviceCount: HTMLElement;

  private lastPositions: Map<string, { x: number; y: number }> = new Map();
  private pendingUpdates: Map<string, CursorData> = new Map();
  private frameRequestId: NodeJS.Immediate | null = null;
  private highPrecisionMode: boolean = true;

  constructor() {
    this.cursorsContainer = document.getElementById('cursors-container')!;
    this.sensitivityValue = document.getElementById('sensitivity-value')!;
    this.activeCursors = document.getElementById('active-cursors')!;
    this.deviceCount = document.getElementById('device-count')!;

    this.init();
  }

  private async init(): Promise<void> {
    try {
      this.config = await ipcRenderer.invoke('get-config');
      this.updateInfoPanel();

      const handlers: Record<string, (data: any) => void> = {
        'cursors-updated': (d: CursorData[]) => this.updateCursors(d),
        'mouse-move': (d: MouseMoveData) => this.updateSingleCursor(d),
        'cursor-position-update': (d: CursorData) => this.handleHighPrecisionUpdate(d),
        'cursors-instant-update': (d: CursorInstantUpdateData) => this.handleInstantUpdate(d),
        'cursor-removed': (d: string) => this.removeCursor(d),
        'devices-updated': (d: { count: number }) => (this.deviceCount.textContent = d.count.toString()),
        'config-updated': (d: AppConfig) => {
          this.config = d;
          this.updateInfoPanel();
        },
        'cursor-type-changed': (d: CursorTypeChangeData) => this.updateCursorType(d),
        'cursors-visibility-update': (d: CursorVisibilityData) => this.updateCursorsVisibility(d),
      };

      for (const [evt, fn] of Object.entries(handlers)) {
        ipcRenderer.on(evt, (event, data) => fn(data));
      }

      document.addEventListener('pointermove', (e: PointerEvent) => this.handlePointerMove(e));
      this.startHighPrecisionLoop();
    } catch (err) {
      console.error('Error initializing renderer:', err);
    }
  }

  public cleanup(): void {
    if (this.frameRequestId) {
      clearImmediate(this.frameRequestId);
    }
    this.cursors.forEach((c) => c.element?.remove());
    this.cursors.clear();
    this.lastPositions.clear();
    this.pendingUpdates.clear();
  }

  private startHighPrecisionLoop(): void {
    if (!this.highPrecisionMode) return;
    const loop = (): void => {
      if (this.pendingUpdates.size) {
        this.processPendingUpdates();
      }
      this.frameRequestId = setImmediate(loop);
    };
    this.frameRequestId = setImmediate(loop);
  }

  private handleHighPrecisionUpdate(d: CursorData): void {
    if (d.isActive) {
      this.updateCursorPositionInstant(d);
    } else {
      this.pendingUpdates.set(d.deviceId, d);
    }
  }

  private handleInstantUpdate(d: CursorInstantUpdateData): void {
    d.cursors.forEach((c) => this.updateCursorPositionInstant(c));
  }

  private processPendingUpdates(): void {
    this.pendingUpdates.forEach((d) => this.updateCursorPositionInstant(d));
    this.pendingUpdates.clear();
  }

  private updateCursorPositionInstant(d: CursorData): void {
    let cursor = this.cursors.get(d.deviceId);
    if (!cursor) {
      return this.createNewCursor(d.deviceId, d);
    }

    const last = this.lastPositions.get(d.deviceId);
    if (!last || last.x !== d.x || last.y !== d.y) {
      const sizes: Record<string, [number, number, number, number]> = {
        arrow: [0, 0, 26, 26],
        hand: [-4, -2, 26, 26],
        ibeam: [-1.5, -6, 26, 26],
        sizens: [-3, -9, 26, 26],
        sizewe: [-8, -3, 26, 26],
        sizenwse: [-6, -6, 26, 26],
        sizenesw: [-6, -6, 26, 26],
        sizeall: [-8, -8, 26, 26],
        default: [0, 0, 26, 26],
      };
      const [ox, oy, w, h] = sizes[(d.cursorType || '').toLowerCase()] || sizes.default;
      
      cursor.element.style.transform = `translate3d(${d.x + ox}px, ${d.y + oy}px, 0)`;
      cursor.element.style.width = `${w}px`;
      cursor.element.style.height = `${h}px`;
      
      this.lastPositions.set(d.deviceId, { x: d.x, y: d.y });
    }

    if (d.cursorType && d.cursorType !== cursor.cursorType) {
      this.updateCursorTypeClass(cursor.element, cursor.cursorType, d.cursorType);
    }
    cursor.cursorType = d.cursorType || cursor.cursorType;
    cursor.data = d;
  }

  private updateCursorTypeClass(el: HTMLElement, oldT: string | undefined, newT: string): void {
    if (oldT) {
      el.classList.remove(`cursor-type-${oldT.toLowerCase()}`);
    }
    if (newT) {
      el.classList.add(`cursor-type-${newT.toLowerCase()}`);
    }
  }

  private updateCursors(arr: CursorData[]): void {
    const existing = new Set(this.cursors.keys());
    arr.forEach((d) => {
      existing.delete(d.deviceId);
      this.updateSingleCursor(d);
    });
    existing.forEach((id) => this.removeCursor(id));
    this.updateInfoPanel();
  }

  private updateSingleCursor(d: CursorData | MouseMoveData): void {
    const deviceId = d.deviceId;
    const cursorData: CursorData = 'dx' in d ? { ...d, id: deviceId } : d;
    
    if (this.cursors.has(deviceId)) {
      this.updateExistingCursor(deviceId, cursorData);
    } else {
      this.createNewCursor(deviceId, cursorData);
    }
    this.updateInfoPanel();
  }

  private updateCursorsVisibility(data: CursorVisibilityData): void {
    data.cursors.forEach((d) => {
      const cursor = this.cursors.get(d.deviceId);
      if (cursor) {
        cursor.element.style.opacity = d.isVisible ? '1' : '0';
        cursor.element.style.pointerEvents = d.isVisible ? 'auto' : 'none';
        cursor.element.style.visibility = d.isVisible ? 'visible' : 'hidden';
        cursor.element.style.display = d.isVisible ? 'block' : 'none';
      }
    });
  }

  private updateCursorType(d: CursorTypeChangeData): void {
    const c = this.cursors.get(d.activeDeviceId);
    if (!c) return;
    
    // Remove all cursor-type classes
    const classesToRemove = Array.from(c.element.classList).filter((cls) => cls.startsWith('cursor-type-'));
    c.element.classList.remove(...classesToRemove);
    c.element.classList.add(`cursor-type-${d.type.toLowerCase()}`);
    Object.assign(c, { 
      cursorType: d.type, 
      cursorCSS: d.cssClass, 
      cursorFile: d.file 
    });
  }

  private createNewCursor(id: string, d: CursorData): void {
    const el = document.createElement('div');
    el.className = `cursor cursor-${this.cursors.size % 8}`;
    el.id = `cursor-${id}`;
    Object.assign(el.style, {
      willChange: 'transform, visibility',
      backfaceVisibility: 'hidden',
      perspective: '1000px',
      visibility: 'visible',
      display: 'block',
      opacity: '1',
      position: 'absolute',
      zIndex: '1000',
      pointerEvents: 'none',
    });

    if (d.color) {
      el.style.borderColor = d.color;
      el.style.background = d.color;
    }

    if (d.cursorType) {
      el.classList.add(`cursor-type-${d.cursorType.toLowerCase()}`);
    } else {
      el.classList.add('cursor-type-arrow');
    }

    el.appendChild(Object.assign(document.createElement('div'), { className: 'cursor-body' }));
    el.style.transform = `translate3d(${d.x || 400}px, ${d.y || 300}px, 0)`;
    this.cursorsContainer.appendChild(el);

    const cursorInfo: CursorInfo = {
      element: el,
      data: d,
      cursorType: d.cursorType || 'Arrow',
      cursorCSS: d.cursorCSS || 'default',
      cursorFile: d.cursorFile || 'aero_arrow.cur'
    };

    this.cursors.set(id, cursorInfo);
    this.lastPositions.set(id, { x: d.x || 400, y: d.y || 300 });
  }

  private updateExistingCursor(id: string, d: CursorData): void {
    const c = this.cursors.get(id);
    if (!c) return;
    
    c.element.style.transform = `translate3d(${d.x}px, ${d.y}px, 0)`;
    Object.assign(c.element.style, {
      opacity: d.isVisible === false ? '0' : '1',
      pointerEvents: d.isVisible === false ? 'none' : 'auto',
    });

    if (d.cursorType && d.cursorType !== c.cursorType) {
      this.updateCursorTypeClass(c.element, c.cursorType, d.cursorType);
      c.cursorType = d.cursorType;
      c.cursorCSS = d.cursorCSS || c.cursorCSS;
      c.cursorFile = d.cursorFile || c.cursorFile;
    }
    c.data = d;
  }

  private removeCursor(id: string): void {
    this.cursors.get(id)?.element.remove();
    this.cursors.delete(id);
    this.lastPositions.delete(id);
    this.updateInfoPanel();
  }

  private updateInfoPanel(): void {
    if (this.config) {
      this.sensitivityValue.textContent = this.config.sensitivity.toFixed(1);
    }
    this.activeCursors.textContent = this.cursors.size.toString();
    
    const dbg = document.getElementById('debug-info');
    if (dbg) {
      dbg.textContent = `Cursors: ${this.cursors.size}`;
    }
    
    ipcRenderer.invoke('get-device-count').then((c: number) => {
      this.deviceCount.textContent = c.toString();
    });
  }

  private addCursorTrail(id: string, x: number, y: number): void {
    const t = Object.assign(document.createElement('div'), { className: 'cursor-trail' });
    Object.assign(t.style, { left: `${x}px`, top: `${y}px` });
    this.cursorsContainer.appendChild(t);
    setTimeout(() => t.remove(), 1000);
  }

  private handlePointerMove(e: PointerEvent): void {
    ipcRenderer.send('mouse-move', { 
      deviceId: `pointer_${e.pointerId}`, 
      deltaX: e.movementX, 
      deltaY: e.movementY 
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new MultimouseRenderer());

window.addEventListener('error', (e: ErrorEvent) => {
  console.error('Window error:', e.error);
});

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  console.error('Unhandled promise rejection:', e.reason);
});
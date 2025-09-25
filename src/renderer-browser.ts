class BuenoxRenderer {
  private cursors: Map<string, any> = new Map();
  private config: any = null;
  private cursorsContainer: HTMLElement;
  private sensitivityValue: HTMLElement;
  private activeCursors: HTMLElement;
  private deviceCount: HTMLElement;
  private cursorMappings: Map<string, string> = new Map();

  private lastPositions: Map<string, { x: number; y: number }> = new Map();
  private pendingUpdates: Map<string, any> = new Map();
  private frameRequestId: any = null;
  private highPrecisionMode: boolean = true;

  constructor() {
    const marker = document.createElement('div');
    marker.id = 'renderer-ready';
    marker.style.display = 'none';
    document.body.appendChild(marker);

    this.cursorsContainer = document.getElementById('cursors-container')!;
    this.sensitivityValue = document.getElementById('sensitivity-value')!;
    this.activeCursors = document.getElementById('active-cursors')!;
    this.deviceCount = document.getElementById('device-count')!;

    const statusEl = document.getElementById('renderer-status');
    if (statusEl) statusEl.textContent = 'Renderer: Chargé!';

    this.init();
  }

  private async init(): Promise<void> {
    try {
      const { ipcRenderer } = require('electron');

      this.config = await ipcRenderer.invoke('get-config');
      this.updateInfoPanel();

      this.loadCursorMappings();

      const handlers: Record<string, (data: any) => void> = {
        'cursors-updated': (d: any[]) => this.updateCursors(d),
        'mouse-move': (d: any) => this.updateSingleCursor(d),
        'cursor-position-update': (d: any) => this.handleHighPrecisionUpdate(d),
        'cursors-instant-update': (d: any) => this.handleInstantUpdate(d),
        'cursor-removed': (d: string) => this.removeCursor(d),
        'devices-updated': (d: { count: number }) => (this.deviceCount.textContent = d.count.toString()),
        'config-updated': (d: any) => {
          this.config = d;
          this.updateInfoPanel();
        },
        'cursor-type-changed': (d: any) => this.updateCursorType(d),
        'cursors-visibility-update': (d: any) => this.updateCursorsVisibility(d),
      };

      for (const [evt, fn] of Object.entries(handlers)) {
        ipcRenderer.on(evt, (_event: any, data: any) => {
          fn(data);
        });
      }

      document.addEventListener('pointermove', (e: PointerEvent) => this.handlePointerMove(e));
      this.startHighPrecisionLoop();

      ipcRenderer.send('renderer-ready');
    } catch (err) {
      console.error('Error initializing renderer:', err);
    }
  }

  private async loadCursorMappings(): Promise<void> {
    try {
      const resp = await fetch('cursorsToUse.json');
      if (!resp.ok) return;
      const map = await resp.json();
      const root = document.documentElement;

      console.log('Chargement des mappings de curseurs:', map);

      for (const [key, filename] of Object.entries(map)) {
        const varName = `--cursor-${String(key).toLowerCase()}`;

        const cleanPath = String(filename).replace(/\s+/g, '%20');
        const url = `url('${cleanPath}')`;
        root.style.setProperty(varName, url);

        this.cursorMappings.set(key.toLowerCase(), cleanPath);

        console.log(`Mapping curseur: ${key} -> ${cleanPath}`);
      }
    } catch (err) {
      console.warn('Could not load cursor mappings:', err);
    }
  }

  private applyCursorStyle(element: HTMLElement, cursorType: string): void {
    const cursorKey = cursorType.toLowerCase();
    const cursorPath = this.cursorMappings.get(cursorKey);

    if (cursorPath) {
      element.style.backgroundImage = `url('${cursorPath}')`;
      element.style.backgroundSize = 'contain';
      element.style.backgroundRepeat = 'no-repeat';
      element.style.backgroundPosition = 'center';

      if (cursorPath.endsWith('.gif')) {
        element.style.imageRendering = 'crisp-edges';
        element.style.filter = 'contrast(1.1) drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.4))';
      } else if (cursorPath.endsWith('.cur')) {
        element.style.imageRendering = 'auto';

        const needsInvert = (cursorKey === 'cross' || cursorKey === 'ibeam') && cursorPath.includes('assets/default/');

        if (needsInvert) {
          element.style.filter = 'invert(1) drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.4))';
          console.log(`Filtre invert appliqué pour: ${cursorType}`);
        } else {
          element.style.filter = 'drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.4))';
        }
      }

      console.log(`Curseur appliqué: ${cursorType} -> ${cursorPath}`);
    } else {
      console.warn(`Pas de mapping trouvé pour le curseur: ${cursorType}`);

      element.classList.add(`cursor-type-${cursorKey}`);
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

  private handleHighPrecisionUpdate(d: any): void {
    if (d.isActive) {
      this.updateCursorPositionInstant(d);
    } else {
      this.pendingUpdates.set(d.deviceId, d);
    }
  }

  private handleInstantUpdate(d: any): void {
    d.cursors.forEach((c: any) => {
      this.updateCursorPositionInstant(c);
    });
  }

  private processPendingUpdates(): void {
    this.pendingUpdates.forEach((d) => this.updateCursorPositionInstant(d));
    this.pendingUpdates.clear();
  }

  private getCursorOffsets(cursorType: string): [number, number, number, number] {
    const cursorKey = cursorType.toLowerCase();
    const cursorPath = this.cursorMappings.get(cursorKey);

    const isGif = cursorPath && cursorPath.endsWith('.gif');

    if (isGif) {
      const gifOffsets: Record<string, [number, number, number, number]> = {
        arrow: [0, 0, 32, 32],
        hand: [0, 0, 32, 32],
        ibeam: [0, 0, 32, 32],
        sizens: [0, 0, 32, 32],
        sizewe: [0, 0, 32, 32],
        sizenwse: [0, 0, 32, 32],
        sizenesw: [0, 0, 32, 32],
        wait: [0, 0, 32, 32],
        sizeall: [0, 0, 32, 32],
        no: [0, 0, 32, 32],
        help: [0, 0, 32, 32],
        busy: [0, 0, 32, 32],
        appstarting: [0, 0, 32, 32],
        normal: [0, 0, 32, 32],
        text: [0, 0, 32, 32],
        vertical: [0, 0, 32, 32],
        horizontal: [0, 0, 32, 32],
        diagonal1: [0, 0, 32, 32],
        diagonal2: [0, 0, 32, 32],
        unavailable: [0, 0, 32, 32],
        uparrow: [0, 0, 32, 32],
      };
      return gifOffsets[cursorKey] || [0, 0, 32, 32];
    } else {
      const curOffsets: Record<string, [number, number, number, number]> = {
        arrow: [0, 0, 26, 26],
        hand: [-4, -2, 26, 26],
        ibeam: [-1.5, -6, 26, 26],
        sizens: [-3, -9, 26, 26],
        sizewe: [-8, -3, 26, 26],
        sizenwse: [-6, -6, 26, 26],
        sizenesw: [-6, -6, 26, 26],
        wait: [-5, -8.5, 26, 26],
        cross: [-10, -10, 35, 35],
        sizeall: [-8, -8, 26, 26],
        no: [-8, -8, 26, 26],
        help: [-1, -1, 26, 26],
        default: [0, 0, 26, 26],
      };
      return curOffsets[cursorKey] || [0, 0, 26, 26];
    }
  }

  private updateCursorPositionInstant(d: any): void {
    let cursor = this.cursors.get(d.deviceId);
    if (!cursor) {
      return this.createNewCursor(d.deviceId, d);
    }

    const last = this.lastPositions.get(d.deviceId);
    if (!last || last.x !== d.x || last.y !== d.y) {
      const [ox, oy, w, h] = this.getCursorOffsets(d.cursorType || 'default');

      Object.assign(cursor.element.style, {
        transform: `translate3d(${d.x + ox}px, ${d.y + oy}px, 0)`,
        width: `${w}px`,
        height: `${h}px`,
        zoom: 1,
        filter: 'contrast(2) grayscale(1), drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.4))',
        visibility: 'visible',
        display: 'block',
        opacity: '1',
      });
      this.lastPositions.set(d.deviceId, { x: d.x, y: d.y });
    }

    if (d.cursorType && d.cursorType !== cursor.cursorType) {
      this.updateCursorTypeClass(cursor.element, cursor.cursorType, d.cursorType);
    }
    cursor.cursorType = d.cursorType || cursor.cursorType;
    cursor.data = d;
  }

  private updateCursorTypeClass(el: HTMLElement, oldT: string | undefined, newT: string): void {
    this.applyCursorStyle(el, newT);
  }

  private updateCursors(arr: any[]): void {
    const existing = new Set(this.cursors.keys());
    arr.forEach((d) => {
      existing.delete(d.deviceId);
      this.updateSingleCursor(d);
    });
    existing.forEach((id) => this.removeCursor(id));
    this.updateInfoPanel();
  }

  private updateSingleCursor(d: any): void {
    const deviceId = d.deviceId;
    const cursorData: any = 'dx' in d ? { ...d, id: deviceId } : d;

    if (this.cursors.has(deviceId)) {
      this.updateExistingCursor(deviceId, cursorData);
    } else {
      this.createNewCursor(deviceId, cursorData);
    }
    this.updateInfoPanel();
  }

  private updateCursorsVisibility(data: any): void {
    data.cursors.forEach((d: any) => {
      const cursor = this.cursors.get(d.deviceId);
      if (cursor) {
        cursor.element.style.opacity = d.isVisible ? '1' : '0';
        cursor.element.style.pointerEvents = d.isVisible ? 'auto' : 'none';
        cursor.element.style.visibility = d.isVisible ? 'visible' : 'hidden';
        cursor.element.style.display = d.isVisible ? 'block' : 'none';
      }
    });
  }

  private updateCursorType(d: any): void {
    const c = this.cursors.get(d.activeDeviceId);
    if (!c) return;

    this.applyCursorStyle(c.element, d.type);
    Object.assign(c, {
      cursorType: d.type,
      cursorCSS: d.cssClass,
      cursorFile: d.file,
    });
  }

  private createNewCursor(id: string, d: any): void {
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
      el.style.backgroundColor = d.color;
      el.style.border = `2px solid ${d.color}`;
    }

    if (d.cursorType) {
      this.applyCursorStyle(el, d.cursorType);
    } else {
      Object.assign(el.style, {
        width: '24px',
        height: '24px',
        backgroundColor: d.color || '#F00',
        border: '2px solid #FFF',
        borderRadius: '50%',
      });
    }

    const cursorBody = document.createElement('div');
    cursorBody.className = 'cursor-body';
    el.appendChild(cursorBody);

    el.style.transform = `translate3d(${d.x || 400}px, ${d.y || 300}px, 0)`;
    this.cursorsContainer.appendChild(el);
    const cursorInfo: any = {
      element: el,
      cursorType: d.cursorType || 'Arrow',
      cursorCSS: d.cursorCSS || 'default',
      cursorFile: d.cursorFile || 'aero_arrow.cur',
      data: d,
    };

    this.cursors.set(id, cursorInfo);
    this.lastPositions.set(id, { x: d.x || 400, y: d.y || 300 });
    this.updateInfoPanel();
  }

  private updateExistingCursor(deviceId: string, d: any): void {
    const cursor = this.cursors.get(deviceId);
    if (!cursor) return;

    cursor.element.style.transform = `translate3d(${d.x}px, ${d.y}px, 0)`;
    Object.assign(cursor.element.style, {
      opacity: d.isVisible === false ? '0' : '1',
      pointerEvents: d.isVisible === false ? 'none' : 'auto',
    });

    if (d.cursorType && d.cursorType !== cursor.cursorType) {
      this.applyCursorStyle(cursor.element, d.cursorType);
      Object.assign(cursor, {
        cursorType: d.cursorType,
        cursorCSS: d.cursorCSS,
        cursorFile: d.cursorFile,
      });
    }

    cursor.data = d;
  }

  private removeCursor(deviceId: string): void {
    console.log(`=== RENDERER: REMOVING CURSOR ===`);
    console.log(`Device ID: ${deviceId}`);

    const cursor = this.cursors.get(deviceId);
    if (cursor) {
      console.log(`Curseur trouvé, suppression de l'élément DOM...`);
      cursor.element.remove();
      this.cursors.delete(deviceId);
      this.lastPositions.delete(deviceId);
      this.updateInfoPanel();
      console.log(`Curseur supprimé avec succès. Curseurs restants: ${this.cursors.size}`);
    } else {
      console.log(`Curseur non trouvé pour le device: ${deviceId}`);
      console.log(`Curseurs actuels:`, Array.from(this.cursors.keys()));
    }
  }

  private updateInfoPanel(): void {
    if (this.sensitivityValue && this.config) {
      this.sensitivityValue.textContent = this.config.sensitivity?.toString() || '1.5';
    }
    if (this.activeCursors) {
      this.activeCursors.textContent = this.cursors.size.toString();
    }

    const dbg = document.getElementById('debug-info');
    if (dbg) {
      dbg.textContent = `Cursors: ${this.cursors.size}`;
    }

    const { ipcRenderer } = require('electron');
    ipcRenderer.invoke('get-device-count').then((c: number) => {
      this.deviceCount.textContent = c.toString();
    });
  }

  private handlePointerMove(e: PointerEvent): void {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('mouse-move', {
      deviceId: `pointer_${e.pointerId}`,
      deltaX: e.movementX,
      deltaY: e.movementY,
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('#renderer-ready')) {
    new BuenoxRenderer();
  }
});

window.addEventListener('load', () => {
  if (!document.querySelector('#renderer-ready')) {
    new BuenoxRenderer();
  }
});

setTimeout(() => {
  if (!document.querySelector('#renderer-ready')) {
    new BuenoxRenderer();
  }
}, 1000);

window.addEventListener('error', (e: ErrorEvent) => {
  console.error('Window error:', e.error);
});

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  console.error('Unhandled promise rejection:', e.reason);
});


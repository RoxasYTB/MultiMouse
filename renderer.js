const { ipcRenderer } = require('electron');

class MultimouseRenderer {
  constructor() {
    this.cursors = new Map();
    this.config = null;
    this.cursorsContainer = document.getElementById('cursors-container');
    this.sensitivityValue = document.getElementById('sensitivity-value');
    this.activeCursors = document.getElementById('active-cursors');
    this.deviceCount = document.getElementById('device-count');

    this.lastPositions = new Map();
    this.pendingUpdates = new Map();
    this.frameRequestId = null;
    this.highPrecisionMode = true;

    this.init();
  }

  async init() {
    try {
      this.config = await ipcRenderer.invoke('get-config');
      this.updateInfoPanel();

      const handlers = {
        'cursors-updated': (d) => this.updateCursors(d),
        'mouse-move': (d) => this.updateSingleCursor(d),
        'cursor-position-update': (d) => this.handleHighPrecisionUpdate(d),
        'cursors-instant-update': (d) => this.handleInstantUpdate(d),
        'cursor-removed': (d) => this.removeCursor(d),
        'devices-updated': (d) => (this.deviceCount.textContent = d.count),
        'config-updated': (d) => {
          this.config = d;
          this.updateInfoPanel();
        },
        'cursor-type-changed': (d) => this.updateCursorType(d),
        'cursors-visibility-update': (d) => this.updateCursorsVisibility(d),
      };

      for (const [evt, fn] of Object.entries(handlers)) ipcRenderer.on(evt, (_, d) => fn(d));
      document.addEventListener('pointermove', (e) => this.handlePointerMove(e));
      this.startHighPrecisionLoop();
    } catch (err) {
      console.error('Erreur init renderer:', err);
    }
  }

  cleanup() {
    if (this.frameRequestId) clearImmediate(this.frameRequestId);
    this.cursors.forEach((c) => c.element?.remove());
    this.cursors.clear();
    this.lastPositions.clear();
    this.pendingUpdates.clear();
  }

  startHighPrecisionLoop() {
    if (!this.highPrecisionMode) return;
    const loop = () => {
      if (this.pendingUpdates.size) {
        this.processPendingUpdates();
      }
      this.frameRequestId = setImmediate(loop);
    };
    this.frameRequestId = setImmediate(loop);
  }

  handleHighPrecisionUpdate(d) {
    d.isActive ? this.updateCursorPositionInstant(d) : this.pendingUpdates.set(d.deviceId, d);
  }
  handleInstantUpdate(d) {
    d.cursors.forEach((c) => this.updateCursorPositionInstant(c));
  }
  processPendingUpdates() {
    this.pendingUpdates.forEach((d) => this.updateCursorPositionInstant(d));
    this.pendingUpdates.clear();
  }

  updateCursorPositionInstant(d) {
    let cursor = this.cursors.get(d.deviceId);
    if (!cursor) return this.createNewCursor(d.deviceId, d);

    const last = this.lastPositions.get(d.deviceId);
    if (!last || last.x !== d.x || last.y !== d.y) {
      const sizes = {
        arrow: [-7.5, -7, 24, 24],
        hand: [-9, -8, 27, 28],
        ibeam: [-12.5, -14, 30, 27],
        sizens: [-12, -12, 35, 35],
        sizewe: [-12, -12, 35, 35],
        sizenwse: [-12, -12, 35, 35],
        sizenesw: [-12, -12, 35, 35],
        sizeall: [-12, -12, 35, 35],
        default: [0, 0, 26, 26],
      };
      const [ox, oy, w, h] = sizes[(d.cursorType || '').toLowerCase()] || sizes.default;
      Object.assign(cursor.element.style, {
        transform: `translate3d(${d.x + ox}px, ${d.y + oy}px, 0)`,
        width: `${w}px`,
        height: `${h}px`,
        zoom: 1,
        imageRendering: 'pixelated',
        filter: 'contrast(2) grayscale(1)',
        visibility: 'visible',
        display: 'block',
        opacity: '1',
      });
      this.lastPositions.set(d.deviceId, { x: d.x, y: d.y });
    }
    if (d.cursorType && d.cursorType !== cursor.cursorType) this.updateCursorTypeClass(cursor.element, cursor.cursorType, d.cursorType);
    cursor.cursorType = d.cursorType;
    cursor.data = d;
  }

  updateCursorTypeClass(el, oldT, newT) {
    if (oldT) el.classList.remove(`cursor-type-${oldT.toLowerCase()}`);
    if (newT) el.classList.add(`cursor-type-${newT.toLowerCase()}`);
  }

  updateCursors(arr) {
    const existing = new Set(this.cursors.keys());
    arr.forEach((d) => {
      existing.delete(d.id);
      this.cursors.has(d.id) ? this.updateExistingCursor(d.id, d) : this.createNewCursor(d.id, d);
    });
    existing.forEach((id) => this.removeCursor(id));
    this.updateInfoPanel();
  }

  updateSingleCursor(d) {
    this.cursors.has(d.deviceId) ? this.updateExistingCursor(d.deviceId, { ...d, id: d.deviceId }) : this.createNewCursor(d.deviceId, { ...d, id: d.deviceId });
    this.updateInfoPanel();
  }

  updateCursorsVisibility(data) {
    data.cursors.forEach((d) => {
      let c = this.cursors.get(d.deviceId);
      if (!c) return this.createNewCursor(d.deviceId, d);
      Object.assign(c.element.style, {
        left: `${d.x}px`,
        top: `${d.y}px`,
        opacity: d.isVisible ? '1' : '0',
        pointerEvents: d.isVisible ? 'auto' : 'none',
      });
      c.data = d;
    });
  }

  updateCursorType(d) {
    const c = this.cursors.get(d.activeDeviceId);
    if (!c) return;
    c.element.classList.remove(...[...c.element.classList].filter((cls) => cls.startsWith('cursor-type-')));
    c.element.classList.add(`cursor-type-${d.type.toLowerCase()}`);
    Object.assign(c, { cursorType: d.type, cursorCSS: d.cssClass, cursorFile: d.file });
  }

  createNewCursor(id, d) {
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
    if (d.cursorType) el.classList.add(`cursor-type-${d.cursorType.toLowerCase()}`);
    else Object.assign(el.style, { width: '24px', height: '24px', backgroundColor: d.color || '#F00', border: '2px solid #FFF', borderRadius: '50%' });

    el.appendChild(Object.assign(document.createElement('div'), { className: 'cursor-body' }));
    el.style.transform = `translate3d(${d.x || 400}px, ${d.y || 300}px, 0)`;
    this.cursorsContainer.appendChild(el);

    this.cursors.set(id, { element: el, data: d, cursorType: d.cursorType || 'Arrow', cursorCSS: d.cursorCSS || 'default', cursorFile: d.cursorFile || 'aero_arrow.cur' });
    this.lastPositions.set(id, { x: d.x || 400, y: d.y || 300 });
  }

  updateExistingCursor(id, d) {
    const c = this.cursors.get(id);
    if (!c) return;
    c.element.style.transform = `translate3d(${d.x}px, ${d.y}px, 0)`;
    Object.assign(c.element.style, {
      opacity: d.isVisible === false ? '0' : '1',
      pointerEvents: d.isVisible === false ? 'none' : 'auto',
    });
    if (d.cursorType && d.cursorType !== c.cursorType) {
      c.element.classList.remove(`cursor-type-${c.cursorType?.toLowerCase()}`);
      c.element.classList.add(`cursor-type-${d.cursorType.toLowerCase()}`);
      Object.assign(c, { cursorType: d.cursorType, cursorCSS: d.cursorCSS, cursorFile: d.cursorFile });
    }
    c.data = d;
  }

  removeCursor(id) {
    this.cursors.get(id)?.element.remove();
    this.cursors.delete(id);
    this.lastPositions.delete(id);
    this.updateInfoPanel();
  }

  updateInfoPanel() {
    if (this.config) this.sensitivityValue.textContent = this.config.sensitivity.toFixed(1);
    this.activeCursors.textContent = this.cursors.size;
    const dbg = document.getElementById('debug-info');
    if (dbg) dbg.textContent = `Curseurs actifs: ${this.cursors.size}\n` + [...this.cursors.entries()].map(([id, c]) => `${id}: (${Math.round(c.data.x)}, ${Math.round(c.data.y)}) - Visible: ${c.element.style.visibility}`).join('\n');
    ipcRenderer.invoke('get-device-count').then((c) => (this.deviceCount.textContent = c));
  }

  addCursorTrail(id, x, y) {
    const t = Object.assign(document.createElement('div'), { className: 'cursor-trail' });
    Object.assign(t.style, { left: `${x}px`, top: `${y}px` });
    this.cursorsContainer.appendChild(t);
    setTimeout(() => t.remove(), 1000);
  }

  handlePointerMove(e) {
    ipcRenderer.send('mouse-move', { deviceId: `pointer_${e.pointerId}`, deltaX: e.movementX, deltaY: e.movementY });
  }
}

document.addEventListener('DOMContentLoaded', () => new MultimouseRenderer());
window.addEventListener('error', () => {});
window.addEventListener('unhandledrejection', () => {});


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class MultimouseRenderer {
    constructor() {
        this.cursors = new Map();
        this.config = null;
        this.lastPositions = new Map();
        this.pendingUpdates = new Map();
        this.frameRequestId = null;
        this.highPrecisionMode = true;
        this.cursorsContainer = document.getElementById('cursors-container');
        this.sensitivityValue = document.getElementById('sensitivity-value');
        this.activeCursors = document.getElementById('active-cursors');
        this.deviceCount = document.getElementById('device-count');
        this.init();
    }
    async init() {
        try {
            this.config = await electron_1.ipcRenderer.invoke('get-config');
            this.updateInfoPanel();
            const handlers = {
                'cursors-updated': (d) => this.updateCursors(d),
                'mouse-move': (d) => this.updateSingleCursor(d),
                'cursor-position-update': (d) => this.handleHighPrecisionUpdate(d),
                'cursors-instant-update': (d) => this.handleInstantUpdate(d),
                'cursor-removed': (d) => this.removeCursor(d),
                'devices-updated': (d) => (this.deviceCount.textContent = d.count.toString()),
                'config-updated': (d) => {
                    this.config = d;
                    this.updateInfoPanel();
                },
                'cursor-type-changed': (d) => this.updateCursorType(d),
                'cursors-visibility-update': (d) => this.updateCursorsVisibility(d),
            };
            for (const [evt, fn] of Object.entries(handlers)) {
                electron_1.ipcRenderer.on(evt, (event, data) => fn(data));
            }
            document.addEventListener('pointermove', (e) => this.handlePointerMove(e));
            this.startHighPrecisionLoop();
        }
        catch (err) {
            console.error('Error initializing renderer:', err);
        }
    }
    cleanup() {
        if (this.frameRequestId) {
            clearImmediate(this.frameRequestId);
        }
        this.cursors.forEach((c) => c.element?.remove());
        this.cursors.clear();
        this.lastPositions.clear();
        this.pendingUpdates.clear();
    }
    startHighPrecisionLoop() {
        if (!this.highPrecisionMode)
            return;
        const loop = () => {
            if (this.pendingUpdates.size) {
                this.processPendingUpdates();
            }
            this.frameRequestId = setImmediate(loop);
        };
        this.frameRequestId = setImmediate(loop);
    }
    handleHighPrecisionUpdate(d) {
        if (d.isActive) {
            this.updateCursorPositionInstant(d);
        }
        else {
            this.pendingUpdates.set(d.deviceId, d);
        }
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
        if (!cursor) {
            return this.createNewCursor(d.deviceId, d);
        }
        const last = this.lastPositions.get(d.deviceId);
        if (!last || last.x !== d.x || last.y !== d.y) {
            const sizes = {
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
    updateCursorTypeClass(el, oldT, newT) {
        if (oldT) {
            el.classList.remove(`cursor-type-${oldT.toLowerCase()}`);
        }
        if (newT) {
            el.classList.add(`cursor-type-${newT.toLowerCase()}`);
        }
    }
    updateCursors(arr) {
        const existing = new Set(this.cursors.keys());
        arr.forEach((d) => {
            existing.delete(d.deviceId);
            this.updateSingleCursor(d);
        });
        existing.forEach((id) => this.removeCursor(id));
        this.updateInfoPanel();
    }
    updateSingleCursor(d) {
        const deviceId = d.deviceId;
        const cursorData = 'dx' in d ? { ...d, id: deviceId } : d;
        if (this.cursors.has(deviceId)) {
            this.updateExistingCursor(deviceId, cursorData);
        }
        else {
            this.createNewCursor(deviceId, cursorData);
        }
        this.updateInfoPanel();
    }
    updateCursorsVisibility(data) {
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
    updateCursorType(d) {
        const c = this.cursors.get(d.activeDeviceId);
        if (!c)
            return;
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
            el.style.borderColor = d.color;
            el.style.background = d.color;
        }
        if (d.cursorType) {
            el.classList.add(`cursor-type-${d.cursorType.toLowerCase()}`);
        }
        else {
            el.classList.add('cursor-type-arrow');
        }
        el.appendChild(Object.assign(document.createElement('div'), { className: 'cursor-body' }));
        el.style.transform = `translate3d(${d.x || 400}px, ${d.y || 300}px, 0)`;
        this.cursorsContainer.appendChild(el);
        const cursorInfo = {
            element: el,
            data: d,
            cursorType: d.cursorType || 'Arrow',
            cursorCSS: d.cursorCSS || 'default',
            cursorFile: d.cursorFile || 'aero_arrow.cur'
        };
        this.cursors.set(id, cursorInfo);
        this.lastPositions.set(id, { x: d.x || 400, y: d.y || 300 });
    }
    updateExistingCursor(id, d) {
        const c = this.cursors.get(id);
        if (!c)
            return;
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
    removeCursor(id) {
        this.cursors.get(id)?.element.remove();
        this.cursors.delete(id);
        this.lastPositions.delete(id);
        this.updateInfoPanel();
    }
    updateInfoPanel() {
        if (this.config) {
            this.sensitivityValue.textContent = this.config.sensitivity.toFixed(1);
        }
        this.activeCursors.textContent = this.cursors.size.toString();
        const dbg = document.getElementById('debug-info');
        if (dbg) {
            dbg.textContent = `Cursors: ${this.cursors.size}`;
        }
        electron_1.ipcRenderer.invoke('get-device-count').then((c) => {
            this.deviceCount.textContent = c.toString();
        });
    }
    addCursorTrail(id, x, y) {
        const t = Object.assign(document.createElement('div'), { className: 'cursor-trail' });
        Object.assign(t.style, { left: `${x}px`, top: `${y}px` });
        this.cursorsContainer.appendChild(t);
        setTimeout(() => t.remove(), 1000);
    }
    handlePointerMove(e) {
        electron_1.ipcRenderer.send('mouse-move', {
            deviceId: `pointer_${e.pointerId}`,
            deltaX: e.movementX,
            deltaY: e.movementY
        });
    }
}
document.addEventListener('DOMContentLoaded', () => new MultimouseRenderer());
window.addEventListener('error', (e) => {
    console.error('Window error:', e.error);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});
//# sourceMappingURL=renderer.js.map
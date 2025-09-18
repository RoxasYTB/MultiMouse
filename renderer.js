const { ipcRenderer } = require('electron');

class MultimouseRenderer {
  constructor() {
    this.cursors = new Map();
    this.config = null;
    this.cursorsContainer = document.getElementById('cursors-container');
    this.sensitivityValue = document.getElementById('sensitivity-value');
    this.activeCursors = document.getElementById('active-cursors');
    this.deviceCount = document.getElementById('device-count');

    this.lastUpdateTime = 0;
    this.updateThrottle = 0;
    this.pendingUpdates = new Map();
    this.frameRequestId = null;
    this.highPrecisionMode = true;

    this.lastPositions = new Map();

    this.systemCursorTracker = null;

    this.init();
  }

  async init() {
    try {
      this.config = await ipcRenderer.invoke('get-config');
      this.updateInfoPanel();

      ipcRenderer.on('cursors-updated', (event, cursorsData) => {
        this.updateCursors(cursorsData);
      });

      ipcRenderer.on('mouse-move', (event, mouseData) => {
        this.updateSingleCursor(mouseData);
      });

      ipcRenderer.on('cursor-position-update', (event, updateData) => {
        this.handleHighPrecisionUpdate(updateData);
      });

      ipcRenderer.on('cursors-instant-update', (event, data) => {
        this.handleInstantUpdate(data);
      });

      ipcRenderer.on('cursor-removed', (event, deviceId) => {
        this.removeCursor(deviceId);
      });

      ipcRenderer.on('devices-updated', (event, data) => {
        this.deviceCount.textContent = data.count.toString();
      });

      ipcRenderer.on('config-updated', (event, newConfig) => {
        this.config = newConfig;
        this.updateInfoPanel();
      });

      ipcRenderer.on('cursor-type-changed', (event, cursorTypeData) => {
        this.updateCursorType(cursorTypeData);
      });

      ipcRenderer.on('cursors-visibility-update', (event, data) => {
        this.updateCursorsVisibility(data);
      });

      ipcRenderer.on('screen-dimensions-changed', (event, dimensions) => {});

      document.addEventListener('pointermove', (event) => {
        this.handlePointerMove(event);
      });

      this.startHighPrecisionLoop();
    } catch (error) {
      console.error('Erreur initialisation renderer:', error);
    }
  }

  cleanup() {
    if (this.frameRequestId) {
      clearImmediate(this.frameRequestId);
      this.frameRequestId = null;
    }

    this.cursors.forEach((cursor, id) => {
      if (cursor.element && cursor.element.parentNode) {
        cursor.element.parentNode.removeChild(cursor.element);
      }
    });

    this.cursors.clear();
    this.lastPositions.clear();
    this.pendingUpdates.clear();
  }

  startHighPrecisionLoop() {
    if (!this.highPrecisionMode) return;

    const processUpdates = () => {
      const now = performance.now();

      if (this.pendingUpdates.size > 0) {
        this.processPendingUpdates();
        this.lastUpdateTime = now;
      }

      if (this.frameRequestId) {
        clearImmediate(this.frameRequestId);
      }
      this.frameRequestId = setImmediate(processUpdates);
    };

    this.frameRequestId = setImmediate(processUpdates);
  }

  handleHighPrecisionUpdate(updateData) {
    if (updateData.isActive) {
      this.updateCursorPositionInstant(updateData);
    } else {
      this.pendingUpdates.set(updateData.deviceId, updateData);
    }
  }

  handleInstantUpdate(data) {
    console.log(`📡 Mise à jour instantanée reçue:`, data);
    data.cursors.forEach((cursorData) => {
      console.log(`🔄 Traitement curseur: ${cursorData.deviceId}`, cursorData);
      this.updateCursorPositionInstant(cursorData);
    });
  }

  processPendingUpdates() {
    if (this.pendingUpdates.size === 0) return;

    this.pendingUpdates.forEach((updateData, deviceId) => {
      this.updateCursorPositionInstant(updateData);
    });

    this.pendingUpdates.clear();
  }

  updateCursorPositionInstant(updateData) {
    const cursor = this.cursors.get(updateData.deviceId);
    if (!cursor) {
      this.createNewCursor(updateData.deviceId, updateData);
      return;
    }

    const element = cursor.element;

    const lastPos = this.lastPositions.get(updateData.deviceId);
    const posChanged = !lastPos || lastPos.x !== updateData.x || lastPos.y !== updateData.y;

    if (posChanged) {
      let offsetX = 0,
        offsetY = 0,
        width = 26,
        height = 26,
        zoom = 1;

      switch ((updateData.cursorType || '').toLowerCase()) {
        case 'arrow':
          offsetX = -7.5;
          offsetY = -7;
          width = 24;
          height = 24;
          break;
        case 'hand':
          offsetX = -9;
          offsetY = -8;
          width = 27;
          height = 28;
          break;
        case 'ibeam':
          offsetX = -12.5;
          offsetY = -14;
          width = 30;
          height = 27;
          break;
        case 'sizens':
        case 'sizewe':
        case 'sizenwse':
        case 'sizenesw':
        case 'sizeall':
          offsetX = -12;
          offsetY = -12;
          width = 35;
          break;
        default:
          offsetX = 0;
          offsetY = 0;
          width = 26;
          break;
      }

      element.style.transform = `translate3d(${updateData.x + offsetX}px, ${updateData.y + offsetY}px, 0)`;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.zoom = zoom;

      element.style.imageRendering = 'pixelated';
      element.style.filter = 'contrast(2) grayscale(1)';
      this.lastPositions.set(updateData.deviceId, { x: updateData.x, y: updateData.y });
    }

    if (updateData.isActive) {
      element.style.visibility = 'visible';
      element.style.display = 'block';
    } else {
      element.style.visibility = 'visible';
      element.style.display = 'block';
      element.style.opacity = '1';
    }

    if (updateData.cursorType && updateData.cursorType !== cursor.cursorType) {
      this.updateCursorTypeClass(element, cursor.cursorType, updateData.cursorType);
      cursor.cursorType = updateData.cursorType;
    }

    cursor.data = updateData;
  }

  updateCursorTypeClass(element, oldType, newType) {
    if (oldType) {
      const oldTypeClass = `cursor-type-${oldType.toLowerCase()}`;
      element.classList.remove(oldTypeClass);
    }

    if (newType) {
      const newTypeClass = `cursor-type-${newType.toLowerCase()}`;
      element.classList.add(newTypeClass);
    }
  }

  updateCursors(cursorsData) {
    const existingCursorIds = new Set(this.cursors.keys());

    cursorsData.forEach((cursorData) => {
      const cursorId = cursorData.id;
      existingCursorIds.delete(cursorId);

      if (this.cursors.has(cursorId)) {
        this.updateExistingCursor(cursorId, cursorData);
      } else {
        this.createNewCursor(cursorId, cursorData);
      }
    });

    existingCursorIds.forEach((cursorId) => {
      this.removeCursor(cursorId);
    });

    this.updateInfoPanel();
  }

  updateSingleCursor(mouseData) {
    const cursorId = mouseData.deviceId;

    if (this.cursors.has(cursorId)) {
      this.updateExistingCursor(cursorId, {
        id: cursorId,
        x: mouseData.x,
        y: mouseData.y,
        color: mouseData.color,
        cursorType: mouseData.cursorType,
        cursorCSS: mouseData.cursorCSS,
        cursorFile: mouseData.cursorFile,
        isVisible: mouseData.isVisible,
      });
    } else {
      this.createNewCursor(cursorId, {
        id: cursorId,
        x: mouseData.x,
        y: mouseData.y,
        cursorType: mouseData.cursorType,
        cursorCSS: mouseData.cursorCSS,
        cursorFile: mouseData.cursorFile,
        isVisible: mouseData.isVisible,
      });
    }

    this.updateInfoPanel();
  }

  updateCursorsVisibility(data) {
    data.cursors.forEach((cursorData) => {
      if (this.cursors.has(cursorData.deviceId)) {
        const cursor = this.cursors.get(cursorData.deviceId);
        const element = cursor.element;

        element.style.left = `${cursorData.x}px`;
        element.style.top = `${cursorData.y}px`;

        if (cursorData.isVisible) {
          element.style.opacity = '1';
          element.style.pointerEvents = 'auto';
        } else {
          element.style.opacity = '0';
          element.style.pointerEvents = 'none';
        }

        cursor.data = cursorData;
      } else {
        this.createNewCursor(cursorData.deviceId, cursorData);
      }
    });
  }

  updateCursorType(cursorTypeData) {
    if (cursorTypeData.activeDeviceId && this.cursors.has(cursorTypeData.activeDeviceId)) {
      const cursorInfo = this.cursors.get(cursorTypeData.activeDeviceId);
      const element = cursorInfo.element;

      element.classList.remove(...Array.from(element.classList).filter((cls) => cls.startsWith('cursor-type-')));

      const typeClass = `cursor-type-${cursorTypeData.type.toLowerCase()}`;
      element.classList.add(typeClass);

      cursorInfo.cursorType = cursorTypeData.type;
      cursorInfo.cursorCSS = cursorTypeData.cssClass;
      cursorInfo.cursorFile = cursorTypeData.file;
    } else {
    }
  }

  createNewCursor(cursorId, cursorData) {
    console.log(`🎯 Création du curseur: ${cursorId}`, cursorData);

    const cursorElement = document.createElement('div');

    cursorElement.className = `cursor cursor-${this.cursors.size % 8}`;
    cursorElement.id = `cursor-${cursorId}`;

    cursorElement.style.willChange = 'transform, visibility';
    cursorElement.style.backfaceVisibility = 'hidden';
    cursorElement.style.perspective = '1000px';

    if (cursorData.color) {
      cursorElement.style.backgroundColor = cursorData.color;
      cursorElement.style.border = `2px solid ${cursorData.color}`;
    }

    if (cursorData.cursorType) {
      const typeClass = `cursor-type-${cursorData.cursorType.toLowerCase()}`;
      cursorElement.classList.add(typeClass);
      console.log(`🎨 Type de curseur appliqué: ${typeClass}`);
    } else {
      cursorElement.style.width = '24px';
      cursorElement.style.height = '24px';
      cursorElement.style.backgroundColor = cursorData.color || '#FF0000';
      cursorElement.style.border = '2px solid #FFFFFF';
      cursorElement.style.borderRadius = '50%';
      console.log(`🎨 Curseur par défaut appliqué`);
    }

    cursorElement.style.visibility = 'visible';
    cursorElement.style.display = 'block';
    cursorElement.style.opacity = '1';
    cursorElement.style.position = 'absolute';
    cursorElement.style.zIndex = '1000';

    cursorElement.style.pointerEvents = 'none';

    const arrow = document.createElement('div');
    arrow.className = 'cursor-body';
    arrow.innerHTML = ``;
    cursorElement.appendChild(arrow);

    const posX = cursorData.x || 400;
    const posY = cursorData.y || 300;
    cursorElement.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;

    console.log(`📍 Position du curseur: (${posX}, ${posY})`);

    this.cursorsContainer.appendChild(cursorElement);
    console.log(`✅ Curseur ajouté au DOM: ${cursorId}`);

    setTimeout(() => {
      const element = document.getElementById(`cursor-${cursorId}`);
      if (element) {
        console.log(`🔍 Élément trouvé dans le DOM:`, element.style.transform);
      } else {
        console.error(`❌ Élément NON trouvé dans le DOM: cursor-${cursorId}`);
      }
    }, 100);

    this.cursors.set(cursorId, {
      element: cursorElement,
      data: cursorData,
      cursorType: cursorData.cursorType || 'Arrow',
      cursorCSS: cursorData.cursorCSS || 'default',
      cursorFile: cursorData.cursorFile || 'aero_arrow.cur',
    });

    this.lastPositions.set(cursorId, { x: posX, y: posY });
  }

  updateExistingCursor(cursorId, cursorData) {
    const cursor = this.cursors.get(cursorId);
    if (!cursor) return;

    this.positionCursor(cursor.element, cursorData);

    if (cursorData.isVisible !== undefined) {
      if (cursorData.isVisible) {
        cursor.element.style.opacity = '1';
        cursor.element.style.pointerEvents = 'auto';
      } else {
        cursor.element.style.opacity = '0';
        cursor.element.style.pointerEvents = 'none';
      }
    } else {
      cursor.element.style.opacity = '1';
      cursor.element.style.pointerEvents = 'auto';
    }

    if (cursorData.cursorType && cursorData.cursorType !== cursor.cursorType) {
      if (cursor.cursorType) {
        const oldTypeClass = `cursor-type-${cursor.cursorType.toLowerCase()}`;
        cursor.element.classList.remove(oldTypeClass);
      }

      const newTypeClass = `cursor-type-${cursorData.cursorType.toLowerCase()}`;
      cursor.element.classList.add(newTypeClass);

      cursor.cursorType = cursorData.cursorType;
      cursor.cursorCSS = cursorData.cursorCSS;
      cursor.cursorFile = cursorData.cursorFile;
    }

    cursor.data = cursorData;
  }

  positionCursor(element, cursorData) {
    element.style.transform = `translate3d(${cursorData.x}px, ${cursorData.y}px, 0)`;
  }

  removeCursor(cursorId) {
    const cursor = this.cursors.get(cursorId);
    if (!cursor) return;

    if (cursor.element.parentNode) {
      cursor.element.parentNode.removeChild(cursor.element);
    }
    this.cursors.delete(cursorId);
    this.lastPositions.delete(cursorId);
    this.updateInfoPanel();
  }

  updateInfoPanel() {
    if (this.config) {
      this.sensitivityValue.textContent = this.config.sensitivity.toFixed(1);
    }
    if (this.activeCursors) {
      this.activeCursors.textContent = this.cursors.size.toString();
    }

    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
      let debugText = `Curseurs actifs: ${this.cursors.size}\n`;
      this.cursors.forEach((cursor, id) => {
        const rect = cursor.element.getBoundingClientRect();
        debugText += `${id}: (${Math.round(cursor.data.x)}, ${Math.round(cursor.data.y)}) - Visible: ${cursor.element.style.visibility}\n`;
      });
      debugInfo.textContent = debugText;
    }

    ipcRenderer.invoke('get-device-count').then((count) => {
      this.deviceCount.textContent = count.toString();
    });
  }

  addCursorTrail(cursorId, x, y) {
    const trail = document.createElement('div');
    trail.className = 'cursor-trail';
    trail.style.left = `${x}px`;
    trail.style.top = `${y}px`;

    this.cursorsContainer.appendChild(trail);

    setTimeout(() => {
      if (trail.parentNode) {
        trail.parentNode.removeChild(trail);
      }
    }, 1000);
  }

  handlePointerMove(event) {
    const mouseData = {
      deviceId: `pointer_${event.pointerId}`,
      deltaX: event.movementX,
      deltaY: event.movementY,
    };

    ipcRenderer.send('mouse-move', mouseData);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const renderer = new MultimouseRenderer();
});

window.addEventListener('error', (event) => {});

window.addEventListener('unhandledrejection', (event) => {});



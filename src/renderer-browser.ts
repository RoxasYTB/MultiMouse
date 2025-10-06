class OrionixRenderer {
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
  private systemCursorSize: number = 32;

  private screenOffsetX: number = 0;
  private screenOffsetY: number = 0;
  private screenWidth: number = 0;
  private screenHeight: number = 0;
  private displayIndex: number = 0;
  private screenInfoReceived: boolean = false;

  constructor() {
    this.readURLParameters();

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

  private readURLParameters(): void {
    try {
      const urlParams = new URLSearchParams(window.location.search);

      if (urlParams.has('displayIndex')) {
        this.displayIndex = parseInt(urlParams.get('displayIndex')!) || 0;
        this.screenInfoReceived = true;
        console.log(`🔒 DisplayIndex initialisé depuis URL: ${this.displayIndex + 1}`);
      }

      if (urlParams.has('offsetX')) {
        this.screenOffsetX = parseFloat(urlParams.get('offsetX')!) || 0;
        console.log(`🔒 OffsetX initialisé depuis URL: ${this.screenOffsetX}`);
      }

      if (urlParams.has('offsetY')) {
        this.screenOffsetY = parseFloat(urlParams.get('offsetY')!) || 0;
        console.log(`🔒 OffsetY initialisé depuis URL: ${this.screenOffsetY}`);
      }

      if (this.screenInfoReceived) {
        this.updateDebugDisplay();
      }
    } catch (err) {
      console.error('Erreur lors de la lecture des paramètres URL:', err);
    }
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
        'hide-cursor': (deviceId: string) => this.hideCursor(deviceId),
        'devices-updated': (d: { count: number }) => (this.deviceCount.textContent = d.count.toString()),
        'config-updated': (d: any) => {
          this.config = d;
          this.updateInfoPanel();
        },
        'settings-updated': (d: any) => this.handleSettingsUpdate(d),
        'update-cursor-opacity': (opacity: number) => this.updateCursorOpacity(opacity),
        'update-color-identification': (enabled: boolean) => this.updateColorIdentification(enabled),
        'toggle-debug-mode': (enabled: boolean) => this.toggleDebugMode(enabled),
        'cursor-type-changed': (d: any) => this.updateCursorType(d),
        'cursors-visibility-update': (d: any) => this.updateCursorsVisibility(d),
        'cursors-config-changed': () => this.reloadCursorMappings(),
        'system-cursor-size': (size: number) => this.handleSystemCursorSize(size),
        'screen-info': (d: any) => this.handleScreenInfo(d),
      };

      for (const [evt, fn] of Object.entries(handlers)) {
        ipcRenderer.on(evt, (_event: any, data: any) => {
          fn(data);
        });
      }

      document.addEventListener('pointermove', (e: PointerEvent) => this.handlePointerMove(e));
      this.startHighPrecisionLoop();

      ipcRenderer.send('get-system-cursor-size');

      ipcRenderer.send('renderer-ready');
    } catch (err) {
      console.error('Error initializing renderer:', err);
    }
  }

  private async loadCursorMappings(): Promise<void> {
    try {
      let map: any = null;

      try {
        if (typeof process !== 'undefined' && process.resourcesPath) {
          const path = require('path');
          const fs = require('fs');
          const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'cursorsToUse.json');
          if (fs.existsSync(unpackedPath)) {
            let raw = fs.readFileSync(unpackedPath, 'utf8');

            if (raw.charCodeAt(0) === 0xfeff) {
              raw = raw.slice(1);
            }
            map = JSON.parse(raw);
          }
        }
      } catch (e) {
        console.warn('Erreur en lisant cursorsToUse.json depuis resources:', e);
      }

      if (!map) {
        try {
          const resp = await fetch('cursorsToUse.json');
          if (resp.ok) {
            let rawText = await resp.text();

            if (rawText.charCodeAt(0) === 0xfeff) {
              rawText = rawText.slice(1);
            }
            map = JSON.parse(rawText);
          }
        } catch (e) {
          console.warn('Could not fetch cursorsToUse.json via fetch:', e);
          return;
        }
      }

      if (!map) {
        console.warn('No cursor mapping found, using defaults');
        return;
      }

      const root = document.documentElement;
      console.log('Chargement des mappings de curseurs:', map);

      for (const [key, filename] of Object.entries(map)) {
        const varName = `--cursor-${String(key).toLowerCase()}`;
        let cleanPath = String(filename).replace(/\s+/g, '%20');

        let finalPath = cleanPath;
        let pathFound = false;

        try {
          if (typeof process !== 'undefined' && process.resourcesPath) {
            const path = require('path');
            const fs = require('fs');
            const candidate = path.join(process.resourcesPath, 'app.asar.unpacked', cleanPath);
            const exists = fs.existsSync(candidate);
            console.log(`Diagnostic: checking unpacked candidate for ${cleanPath}: ${candidate} -> exists=${exists}`);
            if (exists) {
              const fileUrl = 'file:///' + candidate.replace(/\\/g, '/');
              finalPath = fileUrl;
              pathFound = true;
            }
          }
        } catch (e) {
          console.warn('Diagnostic: erreur lors de la vérification du fichier unpacked', e);
        }

        if (!pathFound) {
          const testPaths = [cleanPath, `app.asar.unpacked/${cleanPath}`, `../app.asar.unpacked/${cleanPath}`, `../../app.asar.unpacked/${cleanPath}`];

          for (const testPath of testPaths) {
            try {
              const testResp = await fetch(testPath);
              if (testResp.ok) {
                finalPath = testPath;
                pathFound = true;
                break;
              }
            } catch {}
          }
        }

        if (!finalPath || finalPath === cleanPath) {
          const testPaths = [cleanPath, `app.asar.unpacked/${cleanPath}`, `../app.asar.unpacked/${cleanPath}`, `../../app.asar.unpacked/${cleanPath}`];

          for (const testPath of testPaths) {
            try {
              const testResp = await fetch(testPath);
              if (testResp.ok) {
                finalPath = testPath;
                break;
              }
            } catch {}
          }
        }

        const url = `url('${finalPath}')`;
        root.style.setProperty(varName, url);
        this.cursorMappings.set(key.toLowerCase(), finalPath);

        try {
          const fs = require('fs');
          if (String(finalPath).startsWith('file:///')) {
            const filePath = String(finalPath).replace('file:///', '').replace(/^\/+/, '');
            const exists = fs.existsSync(filePath);
            console.log(`Mapping curseur: ${key} -> ${finalPath} (file exists=${exists})`);
            if (!exists) {
              console.warn(`Mapping diagnostic: fichier introuvable pour ${key}: ${filePath}`);
            }
          } else {
            console.log(`Mapping curseur: ${key} -> ${finalPath}`);
          }
        } catch (e) {
          console.log(`Mapping curseur: ${key} -> ${finalPath} (no fs available)`);
        }
      }
    } catch (err) {
      console.warn('Could not load cursor mappings:', err);
    }
  }

  private handleSystemCursorSize(size: number): void {
    console.log('🖱️ Taille du curseur système reçue:', size);
    this.systemCursorSize = size;

    const scaleRatio = this.systemCursorSize / 32;
    document.documentElement.style.setProperty('--cursor-scale', scaleRatio.toString());

    console.log(`✅ Scaling des curseurs appliqué: ${scaleRatio}x (taille système: ${this.systemCursorSize})`);

    this.cursors.forEach((cursor) => {
      if (cursor.element) {
        this.applyCursorSizeScaling(cursor.element);
      }
    });
  }

  private applyCursorSizeScaling(element: HTMLElement): void {
    const scaleRatio = this.systemCursorSize / 32;

    const currentTransform = element.style.transform;
    const translateMatch = currentTransform.match(/translate3d\([^)]+\)/);
    const translatePart = translateMatch ? translateMatch[0] : 'translate3d(0px, 0px, 0px)';

    element.style.transform = `${translatePart} scale(${scaleRatio})`;
    element.style.transformOrigin = 'center';
  }

  private async reloadCursorMappings(): Promise<void> {
    console.log('Rechargement des mappings de curseurs...');
    this.cursorMappings.clear();
    await this.loadCursorMappings();

    this.cursors.forEach((cursor, deviceId) => {
      if (cursor.element) {
        this.applyCursorStyle(cursor.element, cursor.cursorType);
      }
    });
  }

  private applyCursorStyle(element: HTMLElement, cursorType: string): void {
    const cursorKey = cursorType.toLowerCase();
    const cursorPath = this.cursorMappings.get(cursorKey);

    if (cursorKey === 'hidden') {
      element.style.display = 'none';
      element.style.visibility = 'hidden';
      console.log(`Curseur caché: ${cursorType}`);
      return;
    }

    if (cursorPath) {
      element.style.backgroundImage = `url('${cursorPath}')`;
      element.style.backgroundSize = 'contain';
      element.style.backgroundRepeat = 'no-repeat';
      element.style.backgroundPosition = 'center';
      element.style.display = 'block';
      element.style.visibility = 'visible';

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
      cancelAnimationFrame(this.frameRequestId);
      this.frameRequestId = null;
    }
    this.cursors.forEach((c) => c.element?.remove());
    this.cursors.clear();
    this.lastPositions.clear();
    this.pendingUpdates.clear();
  }

  private hideCursor(deviceId: string): void {
    console.log(`🫥 Masquage du curseur: ${deviceId}`);
    const cursor = this.cursors.get(deviceId);
    if (cursor && cursor.element) {
      cursor.element.style.opacity = '0';
      cursor.element.style.visibility = 'hidden';
    }
  }

  private handleScreenInfo(screenInfo: any): void {
    console.log('📺 Informations écran reçues:', screenInfo);

    this.screenOffsetX = screenInfo.offsetX || 0;
    this.screenOffsetY = screenInfo.offsetY || 0;
    this.screenWidth = screenInfo.bounds?.width || window.innerWidth;
    this.screenHeight = screenInfo.bounds?.height || window.innerHeight;

    if (!this.screenInfoReceived) {
      this.displayIndex = screenInfo.displayIndex || 0;
      this.screenInfoReceived = true;
      console.log(`🔒 DisplayIndex verrouillé à: ${this.displayIndex + 1}`);
    } else {
      console.log(`⚠️ Tentative de changement displayIndex ignorée (déjà configuré à ${this.displayIndex + 1})`);
    }

    const scaleFactor = screenInfo.scaleFactor || 1.0;
    const physicalWidth = Math.round(this.screenWidth * scaleFactor);
    const physicalHeight = Math.round(this.screenHeight * scaleFactor);

    console.log(`🎯 Configuration écran:`);
    console.log(`   - Numéro: ${this.displayIndex + 1}`);
    console.log(`   - Offset: X=${this.screenOffsetX}, Y=${this.screenOffsetY}`);
    console.log(`   - Taille logique: ${this.screenWidth}x${this.screenHeight}`);
    console.log(`   - Taille physique: ${physicalWidth}x${physicalHeight}`);
    console.log(`   - Scale factor: ${scaleFactor} (${scaleFactor * 100}%)`);

    document.documentElement.setAttribute('data-display-id', screenInfo.displayId.toString());
    document.documentElement.setAttribute('data-display-index', this.displayIndex.toString());
    document.documentElement.setAttribute('data-is-primary', screenInfo.isPrimary.toString());
    document.documentElement.setAttribute('data-scale-factor', scaleFactor.toString());

    this.updateDebugDisplay();

    if (screenInfo.bounds) {
      document.documentElement.style.setProperty('--screen-width', `${screenInfo.bounds.width}px`);
      document.documentElement.style.setProperty('--screen-height', `${screenInfo.bounds.height}px`);
      document.documentElement.style.setProperty('--screen-x', `${screenInfo.bounds.x}px`);
      document.documentElement.style.setProperty('--screen-y', `${screenInfo.bounds.y}px`);
      document.documentElement.style.setProperty('--screen-offset-x', `${this.screenOffsetX}px`);
      document.documentElement.style.setProperty('--screen-offset-y', `${this.screenOffsetY}px`);
      document.documentElement.style.setProperty('--scale-factor', scaleFactor.toString());
    }
  }

  private updateDebugDisplay(): void {
    const displayIdEl = document.getElementById('display-id');
    if (displayIdEl) {
      displayIdEl.textContent = `${this.displayIndex + 1}`;
    }

    const offsetsEl = document.getElementById('offsets');
    if (offsetsEl) {
      offsetsEl.textContent = `${this.screenOffsetX}, ${this.screenOffsetY}`;
    }
  }

  private startHighPrecisionLoop(): void {
    if (!this.highPrecisionMode) return;

    const loop = (): void => {
      if (this.pendingUpdates.size > 0) {
        this.processPendingUpdates();
      }
      this.frameRequestId = requestAnimationFrame(loop);
    };
    this.frameRequestId = requestAnimationFrame(loop);
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

    const sizeScale = this.systemCursorSize / 32;

    const isGif = cursorPath && cursorPath.endsWith('.gif');

    if (isGif) {
      const baseSize = 32 * sizeScale;
      const gifOffsets: Record<string, [number, number, number, number]> = {
        arrow: [0, 0, baseSize, baseSize],
        hand: [0, 0, baseSize, baseSize],
        ibeam: [0, 0, baseSize, baseSize],
        sizens: [0, 0, baseSize, baseSize],
        sizewe: [0, 0, baseSize, baseSize],
        sizenwse: [0, 0, baseSize, baseSize],
        sizenesw: [0, 0, baseSize, baseSize],
        wait: [0, 0, baseSize, baseSize],
        sizeall: [0, 0, baseSize, baseSize],
        no: [0, 0, baseSize, baseSize],
        help: [0, 0, baseSize, baseSize],
        busy: [0, 0, baseSize, baseSize],
        appstarting: [0, 0, baseSize, baseSize],
        normal: [0, 0, baseSize, baseSize],
        text: [0, 0, baseSize, baseSize],
        vertical: [0, 0, baseSize, baseSize],
        horizontal: [0, 0, baseSize, baseSize],
        diagonal1: [0, 0, baseSize, baseSize],
        diagonal2: [0, 0, baseSize, baseSize],
        unavailable: [0, 0, baseSize, baseSize],
        uparrow: [0, 0, baseSize, baseSize],
      };
      return gifOffsets[cursorKey] || [0, 0, baseSize, baseSize];
    } else {
      const baseSize = 26 * sizeScale;
      const curOffsets: Record<string, [number, number, number, number]> = {
        arrow: [0, 0, baseSize, baseSize],
        hand: [-4 * sizeScale, -2 * sizeScale, baseSize, baseSize],
        ibeam: [-1.5 * sizeScale, -6 * sizeScale, baseSize, baseSize],
        sizens: [-3 * sizeScale, -9 * sizeScale, baseSize, baseSize],
        sizewe: [-8 * sizeScale, -3 * sizeScale, baseSize, baseSize],
        sizenwse: [-6 * sizeScale, -6 * sizeScale, baseSize, baseSize],
        sizenesw: [-6 * sizeScale, -6 * sizeScale, baseSize, baseSize],
        wait: [-5 * sizeScale, -8.5 * sizeScale, baseSize, baseSize],
        cross: [-10 * sizeScale, -10 * sizeScale, 35 * sizeScale, 35 * sizeScale],
        sizeall: [-8 * sizeScale, -8 * sizeScale, baseSize, baseSize],
        no: [-8 * sizeScale, -8 * sizeScale, baseSize, baseSize],
        help: [-1 * sizeScale, -1 * sizeScale, baseSize, baseSize],
        default: [0, 0, baseSize, baseSize],
      };
      return curOffsets[cursorKey] || [0, 0, baseSize, baseSize];
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

      const adjustedX = d.x - this.screenOffsetX + ox;
      const adjustedY = d.y - this.screenOffsetY + oy;

      cursor.element.style.transform = `translate3d(${adjustedX}px, ${adjustedY}px, 0) scale(${this.systemCursorSize / 32})`;

      const posEl = document.getElementById('cursor-position');
      if (posEl) {
        posEl.textContent = `${Math.round(adjustedX)}, ${Math.round(adjustedY)}`;
      }

      const deviceEl = document.getElementById('current-device');
      if (deviceEl) {
        deviceEl.textContent = d.deviceId;
      }

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
      this.applyCursorSizeScaling(el);
    } else {
      const baseSize = 24;
      const scaledSize = baseSize * (this.systemCursorSize / 32);
      Object.assign(el.style, {
        width: `${scaledSize}px`,
        height: `${scaledSize}px`,
        backgroundColor: d.color || '#F00',
        border: '2px solid #FFF',
        borderRadius: '50%',
      });
    }

    const cursorBody = document.createElement('div');
    cursorBody.className = 'cursor-body';
    el.appendChild(cursorBody);

    const adjustedX = (d.x || 400) - this.screenOffsetX;
    const adjustedY = (d.y || 300) - this.screenOffsetY;

    el.style.transform = `translate3d(${adjustedX}px, ${adjustedY}px, 0)`;
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

    const adjustedX = d.x - this.screenOffsetX;
    const adjustedY = d.y - this.screenOffsetY;

    cursor.element.style.transform = `translate3d(${adjustedX}px, ${adjustedY}px, 0)`;

    Object.assign(cursor.element.style, {
      opacity: d.isVisible === false ? '0' : '1',
      visibility: d.isVisible === false ? 'hidden' : 'visible',
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

  private handleSettingsUpdate(settings: any): void {
    console.log('Settings updated in renderer:', settings);
    this.config = { ...this.config, ...settings };
    this.updateInfoPanel();
  }

  private updateCursorOpacity(opacity: number): void {
    console.log('Updating cursor opacity:', opacity);
    const cursorsContainer = document.getElementById('cursors-container');
    if (cursorsContainer) {
      cursorsContainer.style.opacity = opacity.toString();
    }
  }

  private updateColorIdentification(enabled: boolean): void {
    console.log('Updating color identification:', enabled);

    this.config.colorIdentification = enabled;

    this.refreshCursorColors();
  }

  private refreshCursorColors(): void {
    this.cursors.forEach((cursor, index) => {
      const cursorIndex = Number(index);
      if (this.config.colorIdentification && this.config.cursorColors) {
        const color = this.config.cursorColors[cursorIndex % this.config.cursorColors.length];
        cursor.element.style.borderColor = color;
        cursor.element.style.filter = `hue-rotate(${cursorIndex * 90}deg)`;
      } else {
        cursor.element.style.borderColor = '';
        cursor.element.style.filter = '';
      }
    });
  }

  private toggleDebugMode(enabled: boolean): void {
    console.log('Toggling debug mode:', enabled);
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
      debugInfo.style.display = enabled ? 'block' : 'none';
    }

    this.cursors.forEach((cursor) => {
      const coordsElement = cursor.element.querySelector('.cursor-coords');
      if (coordsElement) {
        coordsElement.style.display = enabled ? 'block' : 'none';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('#renderer-ready')) {
    new OrionixRenderer();
  }
});

window.addEventListener('load', () => {
  if (!document.querySelector('#renderer-ready')) {
    new OrionixRenderer();
  }
});

window.addEventListener('error', (e: ErrorEvent) => {
  console.error('Window error:', e.error);
});

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  console.error('Unhandled promise rejection:', e.reason);
});


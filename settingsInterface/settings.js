class SettingsManager {
  constructor() {
    this.config = window.config || {};
    this.currentTab = this.config.tabs?.[0]?.id || 'cursors';
    this.init();
  }

  init() {
    this.loadSavedSettings();
    this.render();
    this.attachEventListeners();
  }

  render() {
    document.querySelector('.content-header').innerHTML = `
      <h1 class="content-title">${this.config.title || 'Settings'}</h1>
      <p class="content-subtitle">${this.config.subtitle || 'Customize your settings.'}</p>
    `;

    document.querySelector('.sidebar').innerHTML = (this.config.sidebar || [])
      .map(
        (item, index) => `
        <button class="sidebar-item ${item.active ? 'active' : ''} ${item.special || ''}" data-index="${index}">
          ${item.icon}
        </button>
      `,
      )
      .join('');

    document.querySelector('.tabs').innerHTML = (this.config.tabs || [])
      .map(
        (tab) => `
        <button class="tab ${tab.active ? 'active' : ''}" data-tab="${tab.id}">
          ${tab.name}
        </button>
      `,
      )
      .join('');

    this.renderContent();
    this.renderSlides();
    this.initRangeVisuals();
  }

  renderSlides() {
    const slidesConfig = this.config.slides || [];
    const track = document.getElementById('slides-track');
    const indicators = document.getElementById('slide-indicators');
    const prev = document.getElementById('slide-prev');
    const next = document.getElementById('slide-next');

    if (!track || !indicators || !prev || !next) return;

    if (!slidesConfig.length) {
      document.getElementById('slides-component').style.display = 'none';
      return;
    }

    document.getElementById('slides-component').style.display = 'flex';

    track.innerHTML = slidesConfig
      .map(
        (s, i) => `
        <section class="slide" data-index="${i}">
          <h3>${s.title || ''}</h3>
          <p>${s.text || ''}</p>
          ${s.cta ? `<button class="slide-cta" data-cta-index="${i}">${s.cta}</button>` : ''}
        </section>
      `,
      )
      .join('');

    indicators.innerHTML = slidesConfig.map((_, i) => `<button data-indicator="${i}" class="${i === 0 ? 'active' : ''}" aria-label="Slide ${i + 1}"></button>`).join('');

    let current = 0;
    const count = slidesConfig.length;

    const update = (index) => {
      current = (index + count) % count;
      const slideWidth = track.querySelector('.slide')?.clientWidth || 420;
      const gap = 16;
      const offset = current * (slideWidth + gap) * -1;
      track.style.transform = `translateX(${offset}px)`;
      indicators.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      const activeBtn = indicators.querySelector(`button[data-indicator="${current}"]`);
      activeBtn?.classList.add('active');
    };

    prev.onclick = () => update(current - 1);
    next.onclick = () => update(current + 1);

    indicators.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.indicator);
        update(idx);
      });
    });

    track.querySelectorAll('.slide-cta').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.ctaIndex);
        const slide = slidesConfig[idx];
        if (slide && slide.onClick) {
          try {
            new Function('config', slide.onClick)(this.config);
          } catch (err) {
            console.error(err);
          }
        }
      });
    });

    if (this.config.slidesAutoplay) {
      let autoplayInterval = this.config.slidesAutoplayInterval || 5000;
      let timer = setInterval(() => update(current + 1), autoplayInterval);

      const comp = document.getElementById('slides-component');
      comp.addEventListener('mouseenter', () => clearInterval(timer));
      comp.addEventListener('mouseleave', () => (timer = setInterval(() => update(current + 1), autoplayInterval)));
    }

    document.addEventListener('keydown', (e) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === 'ArrowLeft') prev.click();
      if (e.key === 'ArrowRight') next.click();
    });

    setTimeout(() => update(0), 50);
  }

  initRangeVisuals() {
    const ranges = Array.from(document.querySelectorAll('.range'));
    ranges.forEach((r) => this.updateRangeVisual(r));
  }

  updateRangeVisual(rangeEl) {
    if (!rangeEl) return;
    const min = Number(rangeEl.min ?? 0);
    const max = Number(rangeEl.max ?? 100);
    const step = Number(rangeEl.step ?? 1);
    const val = Number(rangeEl.value ?? min);
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    rangeEl.style.setProperty('--fill', pct + '%');

    const stepPct = max > min ? (step / (max - min)) * 100 : 10;

    const safeStep = Math.max(stepPct, 1) + '%';
    const parent = rangeEl.parentElement;
    if (parent) parent.style.setProperty('--step-size', safeStep);
    const display = document.querySelector(`[data-range-display-for="${rangeEl.dataset.setting}"]`);
    if (display) display.textContent = String(val);
  }

  renderContent() {
    const content = document.querySelector('.settings-content');
    const currentSection = this.config.sections?.[this.currentTab];

    if (!currentSection) {
      content.innerHTML = '<div class="no-content">This section is not yet available.</div>';
      return;
    }

    content.innerHTML = `
      <div class="settings-section">
        <h2 class="section-title">${currentSection.title}</h2>
        ${(currentSection.settings || [])
          .map(
            (setting) => `
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">${setting.title}</div>
              <div class="setting-description">${setting.description}</div>
            </div>
            <div class="setting-control">
              ${this.renderControl(setting)}
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    `;
  }

  renderToggle(setting) {
    return `
      <div class="toggle-container">
        <input type="checkbox" class="toggle" id="${setting.id}" data-setting="${setting.id}" ${setting.enabled ? 'checked' : ''}>
        <label for="${setting.id}" class="toggle-label"></label>
      </div>
    `;
  }

  renderControl(setting) {
    const type = setting.type || (setting.options ? 'dropdown' : 'toggle');

    switch (type) {
      case 'dropdown':
        return `
        <div class="dropdown-container">
          <select class="dropdown" data-setting="${setting.id}">
            ${(setting.options || [])
              .map(
                (option) => `
                <option value="${option}" ${option === setting.value ? 'selected' : ''}>
                  ${option}
                </option>
              `,
              )
              .join('')}
          </select>
          <svg class="dropdown-arrow" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z"></path>
          </svg>
        </div>
      `;
      case 'toggle':
        return `
          <div class="dropdown-container toggle-dropdown">
            <select class="dropdown" data-setting="${setting.id}">
              <option value="on" ${setting.enabled ? 'selected' : ''}>On</option>
              <option value="off" ${!setting.enabled ? 'selected' : ''}>Off</option>
            </select>
            <svg class="dropdown-arrow" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z"></path>
            </svg>
          </div>
        `;
      case 'range':
        return `
          <div class="range-container">
            <input class="range" type="range" data-setting="${setting.id}" min="${setting.min ?? 0}" max="${setting.max ?? 100}" step="${setting.step ?? 1}" value="${setting.value ?? setting.min ?? 0}">
            <div class="range-ticks" data-range-ticks-for="${setting.id}"></div>
            <div class="range-value" data-range-display-for="${setting.id}">${setting.value ?? setting.min ?? 0}</div>
          </div>
        `;
      default:
        return '';
    }
  }

  attachEventListeners() {
    const tabsContainer = document.querySelector('.tabs');
    tabsContainer?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) {
        this.switchTab(tab.dataset.tab);
      }
    });

    const sidebarContainer = document.querySelector('.sidebar');
    sidebarContainer?.addEventListener('click', (e) => {
      const item = e.target.closest('.sidebar-item');
      if (item && !item.classList.contains('last')) {
        const index = Number(item.dataset.index);
        this.switchSidebarItem(index);
      }
    });

    document.addEventListener('input', (e) => {
      const target = e.target;

      if (target.classList.contains('range')) {
        const display = document.querySelector(`[data-range-display-for="${target.dataset.setting}"]`);
        if (display) display.textContent = target.value;
        this.updateRangeVisual(target);
      }
    });

    document.addEventListener('change', (e) => {
      const target = e.target;

      if (target.classList.contains('dropdown')) {
        let value;
        if (target.multiple) {
          value = Array.from(target.selectedOptions).map((o) => o.value);
        } else {
          value = target.value;
        }
        this.updateSetting(target.dataset.setting, value);
        return;
      }

      if (target.classList.contains('range')) {
        this.updateSetting(target.dataset.setting, Number(target.value));
        return;
      }

      if (target.classList.contains('color')) {
        this.updateSetting(target.dataset.setting, target.value);
        return;
      }

      if (target.classList.contains('file')) {
        const files = Array.from(target.files || []).map((f) => f.name);
        this.updateSetting(target.dataset.setting, files);
        return;
      }
    });

    this.handleResponsive();
  }

  switchTab(tabId) {
    if (this.config.tabs) {
      this.config.tabs.forEach((tab) => {
        tab.active = tab.id === tabId;
      });
    }

    this.currentTab = tabId;
    this.render();
  }

  switchSidebarItem(index) {
    if (this.config.sidebar) {
      this.config.sidebar.forEach((item, i) => {
        item.active = i === index;
      });
      this.render();
    }
  }

  updateSetting(settingId, value) {
    if (!this.config.sections) return;

    Object.values(this.config.sections).forEach((section) => {
      const setting = section.settings?.find((s) => s.id === settingId);
      if (setting) {
        if (typeof value === 'boolean') {
          setting.enabled = value;
        } else if (typeof value === 'number') {
          setting.value = value;
        } else if (Array.isArray(value)) {
          setting.value = value;
        } else if (typeof value === 'string' && (value === 'on' || value === 'off')) {
          setting.enabled = value === 'on';
        } else if (typeof value === 'string') {
          setting.value = value;
        }
        console.log(`Setting updated: ${settingId} = ${value}`);
        this.saveSettings();
      }
    });
  }

  saveSettings() {
    localStorage.setItem('orionix-cursor-settings', JSON.stringify(this.config));
  }

  loadSavedSettings() {
    const saved = localStorage.getItem('orionix-cursor-settings');
    if (saved) {
      try {
        const savedData = JSON.parse(saved);
        this.mergeSettings(savedData);
      } catch (error) {
        console.error('Error loading saved settings:', error);
      }
    }
  }

  mergeSettings(savedData) {
    if (savedData.sections && this.config.sections) {
      Object.keys(savedData.sections).forEach((sectionKey) => {
        if (this.config.sections[sectionKey]) {
          const savedSettings = savedData.sections[sectionKey].settings || [];
          const currentSettings = this.config.sections[sectionKey].settings || [];

          savedSettings.forEach((savedSetting) => {
            const currentSetting = currentSettings.find((s) => s.id === savedSetting.id);
            if (currentSetting) {
              if (typeof savedSetting.enabled === 'boolean') {
                currentSetting.enabled = savedSetting.enabled;
              }
              if (savedSetting.hasOwnProperty('value')) {
                currentSetting.value = savedSetting.value;
              }
            }
          });
        }
      });
    }
  }

  handleResponsive() {
    const handleResize = () => {
      const isMobile = window.innerWidth <= 768;
      const existingButton = document.querySelector('.mobile-menu-button');
      const existingOverlay = document.querySelector('.overlay');

      if (isMobile && !existingButton) {
        this.createMobileMenu();
      } else if (!isMobile && existingButton) {
        existingButton.remove();
        existingOverlay?.remove();
        document.querySelector('.sidebar')?.classList.remove('mobile-open');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
  }

  createMobileMenu() {
    const mobileMenuButton = document.createElement('button');
    mobileMenuButton.className = 'mobile-menu-button';
    mobileMenuButton.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
      </svg>
    `;

    const mainContainer = document.querySelector('.main-container');
    const sidebar = document.querySelector('.sidebar');
    mainContainer?.insertBefore(mobileMenuButton, sidebar);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    mainContainer?.appendChild(overlay);

    mobileMenuButton.addEventListener('click', () => {
      sidebar?.classList.toggle('mobile-open');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar?.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});


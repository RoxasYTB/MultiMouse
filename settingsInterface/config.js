config = {
  title: 'Settings',
  subtitle: 'Customize your Orionix cursor experience.',
  sidebar: [
    {
      id: 'settings',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="59.9999887" height="59.9999924" viewBox="0 0 15.874997 15.874999"><path fill="currentColor" d="M6.5881222 14.7902062c-.4497916-1.4287498-1.2170832-1.7462498-2.5929163-1.0583332l-1.0054166.5291666-.6879166-.6879166-.6879165-.6879166.5556249-1.0583332c.6879166-1.3758331.396875-2.090208-1.0847915-2.5135413-1.031875-.3175-1.0847916-.396875-1.0847916-1.3758332s.0529167-1.0583332 1.0847916-1.3758331c1.5081248-.4233333 1.8256247-1.1906249 1.0583332-2.487083l-.5820833-.9789583.714375-.7408332.7143748-.7408333 1.0583332.5291666c1.3758332.714375 2.090208.4233333 2.5135414-1.0583332C6.8791639.0529164 6.9585389-3e-7 7.937497-3e-7c.9789574 0 1.0583324.0529167 1.3758324 1.0847915.4233333 1.4816665 1.1641665 1.7991665 2.5929163 1.1641666l1.0847916-.5027083.6614582.6879166.6614583.6614582-.5820833.9789582c-.7672916 1.2964582-.4497916 2.0637498 1.0583332 2.487083 1.0318749.3175 1.0847915.396875 1.0847915 1.3758332s-.0529166 1.0583332-1.0847915 1.3758332c-1.4816665.4233333-1.7727081 1.1377082-1.0847915 2.5135413l.5556249 1.0583332-.6879166.6879166-.6879166.6879166-1.0583332-.555625c-1.3758331-.6879165-2.090208-.3968749-2.5135413 1.0847916-.3175 1.0318749-.396875 1.0847915-1.3758324 1.0847915-.9789582 0-1.0583332-.0529166-1.3493748-1.0847915m3.4395821-4.8418744c.555625-.555625.6879166-.9524999.6879166-2.010833 0-1.8520832-.9260416-2.7781247-2.7781239-2.7781247-1.0847915 0-1.4287498.1322916-2.0372914.7408332-.6085416.5820833-.7408332.9524999-.7408332 2.010833 0 1.349375.5291666 2.2224998 1.5874998 2.6987497.9260415.396875 2.5399989.079375 3.2808321-.6614582"/></svg>`,
      active: true,
    },
    {
      id: 'leave',
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" class="img-fluid" viewBox="0 0 600 600"><g fill="#ee3d31"><path d="M107 493 0 385V205C0 77 4 20 12 12 25-1 336-5 356 8c7 4 14 36 15 72l4 65-37 3-38 3V72l-80-1c-44-1-80 2-80 7 0 4 27 34 60 67l60 59v192c0 197-1 204-39 204-4 0-56-48-114-107m83-140V246l-52-53c-29-29-55-53-58-53s-4 51-2 112l3 113 47 48c25 26 50 47 54 47s8-48 8-107"/><path d="m420 435-23-24 37-36 36-35H300v-80h80c44 0 80-3 80-7s-14-21-30-38l-30-31 25-24 26-24 74 74c41 41 75 81 75 88 0 14-137 162-150 162-4 0-17-11-30-25"/></g></svg>`,
      active: false,
      special: 'last',
    },
  ],
  tabs: [
    { id: 'visuals', name: 'Visuals', active: true },
    { id: 'identification', name: 'Identification', active: false },
    { id: 'functional', name: 'Functional', active: false },
    { id: 'advanced', name: 'Advanced', active: false },
  ],
  sections: {
    visuals: {
      title: 'Cursor Settings',
      settings: [
        { id: 'normal', title: 'Normal Select', description: 'Standard arrow cursor for general selection.', type: 'toggle', enabled: true },
        { id: 'text', title: 'Text Select', description: 'I-beam cursor for text selection.', type: 'toggle', enabled: true },
        { id: 'hand', title: 'Hand Pointer', description: 'Hand cursor for clickable elements.', type: 'toggle', enabled: true },
        { id: 'precision', title: 'Precision Select', description: 'Crosshair cursor for precise selection tasks.', type: 'toggle', enabled: true },
        { id: 'wait', title: 'Wait', description: 'Hourglass or spinner for loading.', type: 'toggle', enabled: true },
        { id: 'busy', title: 'Working in Background', description: 'Indicates background processes.', type: 'toggle', enabled: false },
        { id: 'resize-vertical', title: 'Vertical Resize', description: 'Double arrow vertical resize.', type: 'toggle', enabled: true },
        { id: 'resize-horizontal', title: 'Horizontal Resize', description: 'Double arrow horizontal resize.', type: 'toggle', enabled: true },
        { id: 'resize-diagonal1', title: 'Diagonal Resize \\', description: 'Top-left to bottom-right.', type: 'toggle', enabled: true },
        { id: 'resize-diagonal2', title: 'Diagonal Resize /', description: 'Top-right to bottom-left.', type: 'toggle', enabled: true },
        { id: 'move', title: 'Move', description: 'Four-way arrow for dragging.', type: 'toggle', enabled: true },
        { id: 'unavailable', title: 'Unavailable', description: 'Prohibited action cursor.', type: 'toggle', enabled: true },
      ],
    },
    identification: {
      title: 'Identification',
      settings: [
        { id: 'color', title: 'Cursor Color', description: 'Assign unique colors per user.', type: 'color', value: '#00AEEF' },
        { id: 'size', title: 'Cursor Size', description: 'Set the size of the cursor.', type: 'range', min: 0.5, max: 3, step: 0.1, value: 1 },
        { id: 'opacity', title: 'Opacity', description: 'Transparency level of the cursor.', type: 'range', min: 0.1, max: 1, step: 0.1, value: 1 },
        { id: 'label', title: 'User Label', description: 'Show user ID above cursor.', type: 'toggle', enabled: true },
        { id: 'icon', title: 'Custom Icon', description: 'Upload custom .cur/.ani file.', type: 'file', accept: ['.cur', '.ani'] },
      ],
    },
    functional: {
      title: 'Functional Settings',
      settings: [
        { id: 'speed', title: 'Cursor Speed', description: 'Override default sensitivity.', type: 'range', min: 0.1, max: 5, step: 0.1, value: 1 },
        { id: 'acceleration', title: 'Acceleration', description: 'Enable or disable mouse acceleration.', type: 'toggle', enabled: true },
        { id: 'zones', title: 'Screen Zones', description: 'Restrict cursor to specific areas.', type: 'multiselect', options: ['Left', 'Right', 'Top', 'Bottom'], value: [] },
        { id: 'snap', title: 'Snap to Elements', description: 'Cursor magnetism to windows or buttons.', type: 'toggle', enabled: false },
        { id: 'drawingMode', title: 'Drawing Mode', description: 'Enable drawing mode for Paint/Canvas.', type: 'toggle', enabled: false },
      ],
    },
    advanced: {
      title: 'Advanced Options',
      settings: [
        { id: 'hotkeys', title: 'Hotkeys', description: 'Define shortcuts to hide/show cursors.', type: 'keymap', value: {} },
        { id: 'profiles', title: 'Profiles', description: 'Save and load cursor profiles per user.', type: 'toggle', enabled: true },
        { id: 'sync', title: 'Sync Actions', description: 'Allow simultaneous clicks.', type: 'toggle', enabled: false },
        { id: 'overlayDebug', title: 'Overlay Debug', description: 'Show debug info (coords, deviceID, FPS).', type: 'toggle', enabled: false },
      ],
    },
  },

  slides: [
    {
      title: 'Nouveautés',
      text: "Découvrez les dernières améliorations d'Orionix : meilleure détection et nouvelles icônes.",
      cta: 'En savoir plus',
      onClick: "console.log('Show release notes')",
    },
    {
      title: 'Astuce rapide',
      text: 'Activez le mode « Identification » pour voir les labels utilisateurs au-dessus des curseurs.',
      cta: 'Activer',
      onClick: "config.sections.identification.settings.find(s=>s.id==='label').enabled = true; localStorage.setItem('orionix-cursor-settings', JSON.stringify(config)); window.location.reload();",
    },
    {
      title: 'Personnalisation',
      text: "Chargez vos propres curseurs .cur/.ani dans l'onglet Identification.",
      cta: 'Importer',
      onClick: "console.log('Open import dialog')",
    },
  ],
  slidesAutoplay: true,
  slidesAutoplayInterval: 6000,
};


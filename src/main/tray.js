const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');

class TrayManager {
  constructor(appManager) {
    this.appManager = appManager;
    this.tray = null;
  }

  getTrayIcon() {
    const candidates = [
      path.join(__dirname, '../../assets/icon.png'),
      path.join(__dirname, '../../assets/tray-icon.png'),
      path.join(app.getAppPath(), 'assets/icon.png'),
      path.join(process.resourcesPath, 'assets/icon.png'),
      path.join(__dirname, '../../assets/icon.ico'),
    ];

    for (const cand of candidates) {
      try {
        if (fs.existsSync(cand)) {
          const buf = fs.readFileSync(cand);
          if (buf && buf.length > 0) {
            const img = nativeImage.createFromBuffer(buf);
            if (!img.isEmpty()) {
              return img.resize({ width: 24, height: 24, quality: 'best' });
            }
          }
        }
      } catch (e) {
        console.warn('[Tray] Candidate read error:', cand, e);
      }
    }
    return null;
  }

  init() {
    try {
      const trayIcon = this.getTrayIcon() || nativeImage.createEmpty();
      this.tray = new Tray(trayIcon);
      this.tray.setToolTip('AeroSnap v2.0');

      this.updateContextMenu();

      // Click handler
      this.tray.on('click', () => {
        const settings = store.getSettings();
        const action = settings.general?.trayClickAction || 'show_selector';

        if (action === 'screenshot') {
          this.appManager.openOverlay('screenshot');
        } else if (action === 'video') {
          this.appManager.openOverlay('video');
        } else {
          this.appManager.showSettings();
        }
      });

      this.tray.on('double-click', () => {
        this.appManager.showSettings();
      });

      console.log('[Tray] Tray icon created successfully');
    } catch (e) {
      console.error('[Tray] Failed to initialize tray:', e);
    }
  }

  updateContextMenu() {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '📸 Сделать скриншот (Pause / PrintScreen)',
        click: () => this.appManager.openOverlay('screenshot')
      },
      {
        label: '🎥 Запись видео (ScrollLock)',
        click: () => this.appManager.toggleVideoRecording()
      },
      { type: 'separator' },
      {
        label: '⚙️ Настройки...',
        click: () => this.appManager.showSettings()
      },
      {
        label: '📁 Папка со скриншотами',
        click: () => {
          const settings = store.getSettings();
          if (settings.screenshots?.savePath) {
            this.appManager.openDirectory(settings.screenshots.savePath);
          }
        }
      },
      {
        label: '📁 Папка с видео',
        click: () => {
          const settings = store.getSettings();
          if (settings.video?.savePath) {
            this.appManager.openDirectory(settings.video.savePath);
          }
        }
      },
      { type: 'separator' },
      {
        label: '❌ Закрыть AeroSnap',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }
}

module.exports = TrayManager;

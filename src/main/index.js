const { app, BrowserWindow, ipcMain, dialog, shell, screen, clipboard, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const ShortcutManager = require('./shortcuts');
const TrayManager = require('./tray');
const SoundManager = require('./sound');

// Optimization flags for fast startup, low memory and zero background CPU
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('high-dpi-support', '1');

class AppManager {
  constructor() {
    this.settingsWindow = null;
    this.overlayWindow = null;
    this.shortcutManager = new ShortcutManager(this);
    this.trayManager = new TrayManager(this);
    this.isRecording = false;
  }

  init() {
    // Single instance lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      return;
    }

    app.on('second-instance', () => {
      this.showSettings();
    });

    app.whenReady().then(() => {
      this.trayManager.init();
      this.shortcutManager.registerAll();
      this.setupIpc();
      this.applyAutoStartSettings();

      // Starts silently in background / tray with 0% CPU!
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.showSettings();
        }
    app.on('before-quit', () => {
      this.isQuitting = true;
      app.isQuitting = true;
    });

    app.on('will-quit', () => {
      this.shortcutManager.unregisterAll();
    });

    app.on('window-all-closed', (e) => {
      // Keep running in tray with 0% CPU
      e.preventDefault();
    });
  }

  applyAutoStartSettings() {
    try {
      const settings = store.getSettings();
      const openAtLogin = !!settings.general?.autoStart;
      app.setLoginItemSettings({
        openAtLogin: openAtLogin,
        openAsHidden: true,
        path: process.execPath,
        name: 'AeroSnap'
      });
    } catch (e) {
      console.warn('[AutoStart] Error applying login item settings:', e);
    }
  }

  createSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return;
    }

    const iconIco = path.join(__dirname, '../../assets/icon.ico');
    const iconPng = path.join(__dirname, '../../assets/icon.png');
    const appIcon = fs.existsSync(iconIco) ? iconIco : iconPng;

    this.settingsWindow = new BrowserWindow({
      width: 780,
      height: 600,
      minWidth: 700,
      minHeight: 520,
      title: 'AeroSnap — Настройки',
      icon: appIcon,
      backgroundColor: '#0a192f',
      frame: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        backgroundThrottling: true,
      }
    });

    this.settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

    this.settingsWindow.on('close', (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        this.settingsWindow.hide();
      }
    });
  }

  showSettings() {
    if (!this.settingsWindow) {
      this.createSettingsWindow();
    }
    this.settingsWindow.show();
    this.settingsWindow.focus();
  }

  openOverlay(initialMode = 'screenshot') {
    if (this.overlayWindow) {
      this.overlayWindow.destroy();
      this.overlayWindow = null;
    }

    // Capture primary display info
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;
    const scaleFactor = primaryDisplay.scaleFactor || 1;

    this.overlayWindow = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: width,
      height: height,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreen: false,
      resizable: false,
      enableLargerThanScreen: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      }
    });

    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    this.overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'));

    this.overlayWindow.once('ready-to-show', () => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.show();
        this.overlayWindow.focus();
        this.shortcutManager.registerOverlayEscape();
      }
    });

    this.overlayWindow.webContents.on('did-finish-load', () => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('init-overlay', {
          mode: initialMode,
          displayWidth: width,
          displayHeight: height,
          scaleFactor: scaleFactor,
          settings: store.getSettings()
        });
      }
    });
  }

  closeOverlay() {
    this.shortcutManager.unregisterOverlayEscape();
    if (this.overlayWindow) {
      this.overlayWindow.destroy();
      this.overlayWindow = null;
    }
  }

  toggleVideoRecording() {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('action:trigger-record-video');
    } else {
      this.openOverlay('video');
    }
  }

  pauseVideoRecording() {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('action:trigger-pause-video');
    }
  }

  openDirectory(dirPath) {
    if (dirPath && fs.existsSync(dirPath)) {
      shell.openPath(dirPath);
    }
  }

  generateAutoFileName(saveDir, ext = 'png') {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const appName = 'AeroSnap';

    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    const files = fs.readdirSync(saveDir);
    let maxIndex = 0;
    const pattern = new RegExp(`^${appName}_${dateStr}_(\\d+)`, 'i');

    for (const file of files) {
      const match = file.match(pattern);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (!isNaN(idx) && idx > maxIndex) {
          maxIndex = idx;
        }
      }
    }

    const nextIndex = maxIndex + 1;
    const fileName = `${appName}_${dateStr}_${nextIndex}.${ext}`;
    const filePath = path.join(saveDir, fileName);

    return { fileName, filePath, nextIndex };
  }

  setupIpc() {
    // 1. Settings IPC
    ipcMain.handle('settings:get', () => {
      return store.getSettings();
    });

    ipcMain.handle('settings:save', (_, newSettings) => {
      const res = store.saveSettings(newSettings);
      // Re-register hotkeys on save
      this.shortcutManager.registerAll();
      this.applyAutoStartSettings();
      return res;
    });

    ipcMain.handle('dialog:select-directory', async (_, type) => {
      const currentSettings = store.getSettings();
      const defaultPath = type === 'video'
        ? currentSettings.video?.savePath
        : currentSettings.screenshots?.savePath;

      const result = await dialog.showOpenDialog(this.settingsWindow, {
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: defaultPath || app.getPath('pictures')
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    });

    ipcMain.handle('shell:open-directory', async (_, targetPath) => {
      if (targetPath) {
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
        await shell.openPath(targetPath);
      }
    });

    // 2. Overlay & Capture IPC
    ipcMain.on('overlay:close', () => {
      this.closeOverlay();
    });

    ipcMain.handle('capture:get-sources', async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 400, height: 300 }
      });
      return sources.map(s => ({ id: s.id, name: s.name }));
    });

    // 3. Dynamic Grab Screen Region on Demand (Live Overlay)
    ipcMain.handle('capture:grab-screen-rect', async (_, rect) => {
      try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.bounds;
        const scaleFactor = primaryDisplay.scaleFactor || 1;

        // Momentarily hide overlay window so it does not appear in captured pixels
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          this.overlayWindow.setOpacity(0);
        }

        // Brief delay for compositor update
        await new Promise((resolve) => setTimeout(resolve, 50));

        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.round(width * scaleFactor),
            height: Math.round(height * scaleFactor)
          }
        });

        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          this.overlayWindow.setOpacity(1);
        }

        if (sources.length === 0) return null;

        const fullImage = sources[0].thumbnail;
        if (!rect || !rect.w || !rect.h) {
          return fullImage.toDataURL();
        }

        const cropX = Math.max(0, Math.round(rect.x * scaleFactor));
        const cropY = Math.max(0, Math.round(rect.y * scaleFactor));
        const cropW = Math.min(fullImage.getSize().width - cropX, Math.round(rect.w * scaleFactor));
        const cropH = Math.min(fullImage.getSize().height - cropY, Math.round(rect.h * scaleFactor));

        const croppedImage = fullImage.crop({
          x: cropX,
          y: cropY,
          width: Math.max(1, cropW),
          height: Math.max(1, cropH)
        });

        return croppedImage.toDataURL();
      } catch (e) {
        console.error('[Capture] Error in grab-screen-rect:', e);
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          this.overlayWindow.setOpacity(1);
        }
        return null;
      }
    });

    // 4. Copy Screenshot to Clipboard
    ipcMain.handle('capture:copy-screenshot', async (_, dataUrl) => {
      try {
        const image = nativeImage.createFromDataURL(dataUrl);
        clipboard.writeImage(image);
        return { success: true };
      } catch (e) {
        console.error('[Capture] Error copying image to clipboard:', e);
        return { success: false, error: e.message };
      }
    });

    // 5. Save Screenshot to File (+ copy if enabled)
    ipcMain.handle('capture:save-screenshot', async (_, dataUrl) => {
      try {
        const settings = store.getSettings();
        const saveDir = settings.screenshots?.savePath || path.join(app.getPath('pictures'), 'AeroSnap', 'Screenshots');
        const ext = settings.screenshots?.format === 'jpg' ? 'jpg' : 'png';

        const { fileName, filePath } = this.generateAutoFileName(saveDir, ext);

        const image = nativeImage.createFromDataURL(dataUrl);
        const buffer = ext === 'jpg' ? image.toJPEG(95) : image.toPNG();

        fs.writeFileSync(filePath, buffer);

        // Auto copy to clipboard if configured
        if (settings.screenshots?.autoClipboard !== false) {
          clipboard.writeImage(image);
        }

        return { success: true, filePath, fileName };
      } catch (e) {
        console.error('[Capture] Error saving screenshot:', e);
        return { success: false, error: e.message };
      }
    });

    // 5b. Save Screenshot As (Dialog)
    ipcMain.handle('capture:save-screenshot-as', async (_, dataUrl) => {
      try {
        const settings = store.getSettings();
        const ext = settings.screenshots?.format === 'jpg' ? 'jpg' : 'png';
        const defaultPath = path.join(
          settings.screenshots?.savePath || path.join(app.getPath('pictures'), 'AeroSnap', 'Screenshots'),
          `AeroSnap_${new Date().toISOString().slice(0, 10)}.${ext}`
        );

        const { canceled, filePath } = await dialog.showSaveDialog({
          defaultPath,
          filters: [
            { name: ext === 'jpg' ? 'JPEG Image' : 'PNG Image', extensions: [ext] }
          ]
        });

        if (canceled || !filePath) return null;

        const image = nativeImage.createFromDataURL(dataUrl);
        const buffer = ext === 'jpg' ? image.toJPEG(95) : image.toPNG();
        fs.writeFileSync(filePath, buffer);

        if (settings.screenshots?.autoClipboard !== false) {
          clipboard.writeImage(image);
        }

        try {
          shell.showItemInFolder(filePath);
        } catch (_) {}

        return { success: true, filePath, fileName: path.basename(filePath) };
      } catch (e) {
        console.error('[Capture] Error saving screenshot as:', e);
        return { success: false, error: e.message };
      }
    });

    // 6. Save Recorded Video
    ipcMain.handle('video:save', async (_, arrayBuffer, format = 'mp4') => {
      try {
        const settings = store.getSettings();
        const saveDir = settings.video?.savePath || path.join(app.getPath('pictures'), 'AeroSnap', 'Videos');
        const ext = format === 'gif' ? 'gif' : 'mp4';

        const { fileName, filePath } = this.generateAutoFileName(saveDir, ext);

        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(filePath, buffer);

        // Copy video file path to clipboard if autoClipboard enabled
        if (settings.video?.autoClipboard !== false) {
          clipboard.write({
            text: filePath,
            bookmark: filePath,
          });
        }

        return { success: true, filePath, fileName };
      } catch (e) {
        console.error('[Video] Error saving video:', e);
        return { success: false, error: e.message };
      }
    });

    // 7. Sound feedback
    ipcMain.on('sound:play', (_, soundType) => {
      SoundManager.playChime(soundType);
    });
  }
}

const appManager = new AppManager();
appManager.init();

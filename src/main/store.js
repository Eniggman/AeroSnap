const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Default configuration settings
 */
const DEFAULT_SETTINGS = {
  general: {
    autoStart: false,
    quietMode: false,
    trayClickAction: 'show_selector', // 'show_selector' | 'screenshot' | 'video' | 'settings'
  },
  hotkeys: {
    screenshot: 'Pause',
    pauseVideo: 'ScrollLock',
    dualMouseClick: false,
  },
  screenshots: {
    savePath: '',
    autoClipboard: true,
    format: 'png', // 'png' | 'jpg'
    filenamePattern: 'Screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}',
  },
  video: {
    savePath: '',
    autoClipboard: true,
    format: 'mp4', // 'mp4' | 'webm' | 'gif'
    fps: 30,
    audioBeep: true, // soft non-distracting start/stop chime
  }
};

class Store {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'aerosnap-config.json');
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      // Initialize unified default directory with subfolders for screenshots & videos
      const baseAppDir = path.join(app.getPath('pictures'), 'AeroSnap');
      const defaultScreenshots = path.join(baseAppDir, 'Screenshots');
      const defaultVideos = path.join(baseAppDir, 'Videos');

      DEFAULT_SETTINGS.screenshots.savePath = defaultScreenshots;
      DEFAULT_SETTINGS.video.savePath = defaultVideos;

      if (!fs.existsSync(defaultScreenshots)) {
        fs.mkdirSync(defaultScreenshots, { recursive: true });
      }
      if (!fs.existsSync(defaultVideos)) {
        fs.mkdirSync(defaultVideos, { recursive: true });
      }

      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          general: { ...DEFAULT_SETTINGS.general, ...(parsed.general || {}) },
          hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(parsed.hotkeys || {}) },
          screenshots: { ...DEFAULT_SETTINGS.screenshots, ...(parsed.screenshots || {}) },
          video: { ...DEFAULT_SETTINGS.video, ...(parsed.video || {}) }
        };
      }
    } catch (e) {
      console.error('[Store] Error loading settings:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  saveSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf8');
      return { success: true, settings: this.settings };
    } catch (e) {
      console.error('[Store] Error saving settings:', e);
      return { success: false, error: e.message };
    }
  }

  getSettings() {
    return this.settings;
  }
}

module.exports = new Store();

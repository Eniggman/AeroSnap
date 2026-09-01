const { globalShortcut } = require('electron');
const store = require('./store');

class ShortcutManager {
  constructor(appManager) {
    this.appManager = appManager;
  }

  registerAll() {
    try {
      globalShortcut.unregisterAll();
    } catch (e) {}

    const settings = store.getSettings();
    const hotkeys = settings.hotkeys || {};

    // 1. Screenshot Hotkey (strictly user-configured)
    if (hotkeys.screenshot) {
      const ok = this.safeRegister(hotkeys.screenshot, () => {
        console.log(`[Hotkey] Screenshot triggered via: ${hotkeys.screenshot}`);
        this.appManager.openOverlay('screenshot');
      });
      if (!ok) {
        console.warn(`[Hotkey] Failed to register screenshot shortcut: "${hotkeys.screenshot}"`);
      }
    }

    // 2. Video Record / Stop Hotkey
    if (hotkeys.recordVideo) {
      const ok = this.safeRegister(hotkeys.recordVideo, () => {
        console.log(`[Hotkey] Video Record/Stop triggered via: ${hotkeys.recordVideo}`);
        this.appManager.toggleVideoRecording();
      });
      if (!ok) {
        console.warn(`[Hotkey] Failed to register video shortcut: "${hotkeys.recordVideo}"`);
      }
    }

    // 3. Pause Video Hotkey
    if (hotkeys.pauseVideo) {
      this.safeRegister(hotkeys.pauseVideo, () => {
        console.log(`[Hotkey] Video pause triggered via: ${hotkeys.pauseVideo}`);
        this.appManager.pauseVideoRecording();
      });
    }
  }

  safeRegister(accelerator, callback) {
    if (!accelerator) return false;
    let acc = accelerator.trim();

    // Map common key names to Electron-supported accelerators
    acc = acc.replace(/Ctrl/gi, 'CommandOrControl');
    acc = acc.replace(/PrintScreen|PrtScn|PrtSc/gi, 'PrintScreen');
    acc = acc.replace(/ScrollLock/gi, 'ScrollLock');
    acc = acc.replace(/PauseBreak|Break/gi, 'Pause');

    const candidates = [acc];
    if (acc.toLowerCase() === 'pause') {
      candidates.push('MediaPlayPause');
    }

    for (const keyCandidate of candidates) {
      try {
        if (globalShortcut.register(keyCandidate, callback)) {
          console.log(`[Hotkey] Successfully registered: "${keyCandidate}"`);
          return true;
        }
      } catch (e) {
        console.warn(`[Hotkey] Error registering "${keyCandidate}": ${e.message}`);
      }
    }
    return false;
  }

  unregisterAll() {
    try {
      globalShortcut.unregisterAll();
    } catch (e) {}
  registerOverlayEscape() {
    // Escape is handled locally inside the overlay window DOM keydown listener
    // to avoid intercepting Escape in other OS applications globally.
  }

  unregisterOverlayEscape() {
    // No-op
  }
}

module.exports = ShortcutManager;

(function installTauriBridge() {
  if (window.aeroAPI || !window.__TAURI__) return;

  const { invoke } = window.__TAURI__.core;
  const listen = window.__TAURI__.event && window.__TAURI__.event.listen;

  const listenEvent = (name, callback, payloadOnly = false) => {
    if (!listen) return Promise.resolve(() => {});
    return listen(name, (event) => callback(payloadOnly ? event.payload : event));
  };

  window.aeroAPI = {
    nativeRecording: true,
    getSettings: () => invoke('settings_get'),
    saveSettings: (settings) => invoke('settings_save', { settings }),
    selectDirectory: () => invoke('select_directory'),
    openDirectory: (targetPath) => invoke('open_directory', { targetPath }),

    onInitOverlay: (callback) => {
      const loadOverlay = () => Promise.all([invoke('overlay_init'), invoke('capture_background')])
        .then(([data, pngBytes]) => {
          const blob = new Blob([pngBytes], { type: 'image/png' });
          data.backgroundDataUrl = URL.createObjectURL(blob);
          callback(data);
        })
        .catch(console.error);
      loadOverlay();
      return listenEvent('init-overlay', loadOverlay);
    },
    closeOverlay: () => invoke('overlay_close'),
    overlayReady: () => invoke('overlay_ready'),
    grabScreenRect: (rect) => invoke('capture_grab_screen_rect', { rect }),
    copyScreenshot: (dataUrl) => invoke('capture_copy_screenshot', { dataUrl }),
    saveScreenshot: (dataUrl) => invoke('capture_save_screenshot', { dataUrl }),
    saveScreenshotAs: (dataUrl) => invoke('capture_save_screenshot_as', { dataUrl }),
    getDesktopSources: () => invoke('capture_get_sources'),

    recordingStart: (rect, format) => invoke('recording_start', { rect, format }),
    recordingStop: () => invoke('recording_stop'),
    recordingTogglePause: () => invoke('recording_toggle_pause'),
    recordingCancel: () => invoke('recording_cancel'),
    recordingExport: (format, copyPath) => invoke('recording_export', { format, copyPath }),
    playSound: () => {},
    onTriggerScreenshot: (callback) => listenEvent('action:trigger-screenshot', callback),
    onTriggerRecordVideo: (callback) => listenEvent('action:trigger-record-video', callback),
    onTriggerPauseVideo: (callback) => listenEvent('action:trigger-pause-video', callback),
    onNavigateTab: (callback) => listenEvent('navigate:tab', (event) => callback(event.payload)),
  };
})();

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose secure API to renderers (Settings and Overlay)
 */
contextBridge.exposeInMainWorld('aeroAPI', {
  // Settings API
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (newSettings) => ipcRenderer.invoke('settings:save', newSettings),
  selectDirectory: (type) => ipcRenderer.invoke('dialog:select-directory', type),
  openDirectory: (targetPath) => ipcRenderer.invoke('shell:open-directory', targetPath),
  
  // Overlay & Capture API
  onInitOverlay: (callback) => {
    ipcRenderer.on('init-overlay', (_, data) => callback(data));
  },
  closeOverlay: () => ipcRenderer.send('overlay:close'),
  overlayReady: () => ipcRenderer.send('overlay:ready'),
  grabScreenRect: (rect) => ipcRenderer.invoke('capture:grab-screen-rect', rect),
  copyScreenshot: (dataUrl) => ipcRenderer.invoke('capture:copy-screenshot', dataUrl),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('capture:save-screenshot', dataUrl),
  saveScreenshotAs: (dataUrl) => ipcRenderer.invoke('capture:save-screenshot-as', dataUrl),
  getDesktopSources: () => ipcRenderer.invoke('capture:get-sources'),
  
  // Video Recording API
  saveVideo: (bufferData, format) => ipcRenderer.invoke('video:save', bufferData, format),
  playSound: (soundType) => ipcRenderer.send('sound:play', soundType),

  // Events from Main Process
  onTriggerScreenshot: (callback) => {
    ipcRenderer.on('action:trigger-screenshot', () => callback());
  },
  onTriggerRecordVideo: (callback) => {
    ipcRenderer.on('action:trigger-record-video', () => callback());
  },
  onTriggerPauseVideo: (callback) => {
    ipcRenderer.on('action:trigger-pause-video', () => callback());
  },
  onNavigateTab: (callback) => {
    ipcRenderer.on('navigate:tab', (_, tab) => callback(tab));
  }
});

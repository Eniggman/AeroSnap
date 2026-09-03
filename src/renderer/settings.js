/**
 * Settings UI Logic
 */

let currentSettings = {};

// DOM Elements
const tabs = document.querySelectorAll('.nav-item');
const contents = document.querySelectorAll('.tab-content');
const toast = document.getElementById('toast');

// Inputs
const genAutoStart = document.getElementById('gen-auto-start');
const genQuietMode = document.getElementById('gen-quiet-mode');
const genTrayAction = document.getElementById('gen-tray-action');

const hkScreenshot = document.getElementById('hk-screenshot');
const hkVideo = document.getElementById('hk-video');
const hkPause = document.getElementById('hk-pause');
const hkDualMouse = document.getElementById('hk-dual-mouse');

const scPath = document.getElementById('sc-path');
const btnBrowseSc = document.getElementById('btn-browse-sc');
const btnOpenSc = document.getElementById('btn-open-sc');
const scClipboard = document.getElementById('sc-clipboard');
const scFormat = document.getElementById('sc-format');

const vidPath = document.getElementById('vid-path');
const btnBrowseVid = document.getElementById('btn-browse-vid');
const btnOpenVid = document.getElementById('btn-open-vid');
const vidClipboard = document.getElementById('vid-clipboard');
const vidBeep = document.getElementById('vid-beep');
const vidFormat = document.getElementById('vid-format');

// 1. Tab Switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const targetContent = document.getElementById(`tab-${target}`);
    if (targetContent) targetContent.classList.add('active');
  });
});

// 2. Load Settings on Startup
async function loadSettings() {
  if (window.aeroAPI) {
    try {
      currentSettings = await window.aeroAPI.getSettings();
      renderSettings();
    } catch (error) {
      showToast(`Не удалось загрузить настройки: ${error}`);
    }
  }
}

function renderSettings() {
  // General
  if (genAutoStart) genAutoStart.checked = !!currentSettings.general?.autoStart;
  genQuietMode.checked = !!currentSettings.general?.quietMode;
  genTrayAction.value = currentSettings.general?.trayClickAction || 'show_selector';

  // Hotkeys
  if (hkScreenshot) hkScreenshot.value = currentSettings.hotkeys?.screenshot !== undefined ? currentSettings.hotkeys.screenshot : 'PageUp';
  if (hkVideo) hkVideo.value = currentSettings.hotkeys?.video !== undefined ? currentSettings.hotkeys.video : 'Home';
  if (hkPause) hkPause.value = currentSettings.hotkeys?.pauseVideo !== undefined ? currentSettings.hotkeys.pauseVideo : 'Insert';
  if (hkDualMouse) hkDualMouse.checked = !!currentSettings.hotkeys?.dualMouseClick;

  // Screenshots
  scPath.value = currentSettings.screenshots?.savePath || '';
  scClipboard.checked = currentSettings.screenshots?.autoClipboard !== false;
  scFormat.value = currentSettings.screenshots?.format || 'png';

  // Video
  vidPath.value = currentSettings.video?.savePath || '';
  vidClipboard.checked = currentSettings.video?.autoClipboard !== false;
  vidBeep.checked = currentSettings.video?.audioBeep !== false;
  vidFormat.value = currentSettings.video?.format || 'mp4';
}

// 3. Auto Save on Changes
async function persistSettings() {
  const previousSettings = JSON.parse(JSON.stringify(currentSettings));

  // Mutate the complete object returned by Rust instead of rebuilding the
  // schema from visible controls. This preserves filenamePattern, fps and any
  // fields introduced by future AeroSnap versions.
  currentSettings.general ||= {};
  currentSettings.hotkeys ||= {};
  currentSettings.screenshots ||= {};
  currentSettings.video ||= {};

  currentSettings.general.autoStart = genAutoStart ? genAutoStart.checked : false;
  currentSettings.general.quietMode = genQuietMode.checked;
  currentSettings.general.trayClickAction = genTrayAction.value;

  const getHotkeyVal = (input, fallback) => {
    if (!input) return fallback;
    if (input.value === 'Нажмите клавиши...') return input.dataset.prev || '';
    return input.value;
  };

  currentSettings.hotkeys.screenshot = getHotkeyVal(hkScreenshot, 'PageUp');
  currentSettings.hotkeys.video = getHotkeyVal(hkVideo, 'Home');
  currentSettings.hotkeys.pauseVideo = getHotkeyVal(hkPause, 'Insert');
  currentSettings.hotkeys.dualMouseClick = hkDualMouse ? hkDualMouse.checked : false;

  currentSettings.screenshots.savePath = scPath.value;
  currentSettings.screenshots.autoClipboard = scClipboard.checked;
  currentSettings.screenshots.format = scFormat.value;

  currentSettings.video.savePath = vidPath.value;
  currentSettings.video.autoClipboard = vidClipboard.checked;
  currentSettings.video.audioBeep = vidBeep.checked;
  currentSettings.video.format = vidFormat.value;

  if (window.aeroAPI) {
    try {
      const saved = await window.aeroAPI.saveSettings(currentSettings);
      currentSettings = (saved && saved.settings) ? saved.settings : (saved || currentSettings);
      renderSettings();
      showToast('Настройки сохранены');
    } catch (error) {
      currentSettings = previousSettings;
      renderSettings();
      showToast(`Не удалось применить настройку: ${error}`);
    }
  }
}

function showToast(msg) {
  if (toast) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }
}

// Add event listeners for inputs
[genAutoStart, genQuietMode, genTrayAction, hkDualMouse, scClipboard, scFormat, vidClipboard, vidBeep, vidFormat].filter(Boolean).forEach(el => {
  el.addEventListener('change', persistSettings);
});

// 4. Hotkey Capture System
function setupHotkeyInput(inputEl) {
  let isRecording = false;

  inputEl.addEventListener('focus', () => {
    isRecording = true;
    inputEl.dataset.prev = inputEl.value;
    inputEl.value = 'Нажмите клавиши...';
  });

  inputEl.addEventListener('blur', () => {
    if (isRecording) {
      isRecording = false;
      if (inputEl.value === 'Нажмите клавиши...') {
        inputEl.value = inputEl.dataset.prev || '';
      }
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      inputEl.blur();
      return;
    }

    if (!e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) {
      inputEl.value = '';
      inputEl.blur();
      persistSettings();
      return;
    }

    const keys = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');

    let keyName = e.key;
    if (['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(keyName)) {
      return; // wait for non-modifier key
    }

    if (e.code && e.code.startsWith('Key') && e.code.length === 4) {
      keyName = e.code.slice(3).toUpperCase();
    } else if (e.code && e.code.startsWith('Digit') && e.code.length === 6) {
      keyName = e.code.slice(5);
    } else if (keyName === ' ') {
      keyName = 'Space';
    } else if (keyName.length === 1) {
      keyName = keyName.toUpperCase();
    }

    keys.push(keyName);
    inputEl.value = keys.join('+');
    inputEl.blur();
    persistSettings();
  });
}

[hkScreenshot, hkVideo, hkPause].filter(Boolean).forEach(setupHotkeyInput);

// Clear buttons
document.querySelectorAll('.clear-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (input) {
      input.value = '';
      persistSettings();
    }
  });
});

// 5. Directory Pickers
btnBrowseSc.addEventListener('click', async () => {
  if (window.aeroAPI) {
    const dir = await window.aeroAPI.selectDirectory('screenshot');
    if (dir) {
      scPath.value = dir;
      persistSettings();
    }
  }
});

btnOpenSc.addEventListener('click', () => {
  if (window.aeroAPI && scPath.value) {
    window.aeroAPI.openDirectory(scPath.value);
  }
});

btnBrowseVid.addEventListener('click', async () => {
  if (window.aeroAPI) {
    const dir = await window.aeroAPI.selectDirectory('video');
    if (dir) {
      vidPath.value = dir;
      persistSettings();
    }
  }
});

btnOpenVid.addEventListener('click', () => {
  if (window.aeroAPI && vidPath.value) {
    window.aeroAPI.openDirectory(vidPath.value);
  }
});

// Initialize
loadSettings();

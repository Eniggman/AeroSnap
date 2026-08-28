/**
 * AeroSnap Overlay & Live Canvas Engine
 * Live transparent selection, crisp annotations, studio Web Audio & video recording.
 */

const baseCanvas = document.getElementById('base-canvas');
const baseCtx = baseCanvas.getContext('2d');
const drawCanvas = document.getElementById('draw-canvas');
const drawCtx = drawCanvas.getContext('2d');
const blurEffectCanvas = document.createElement('canvas');
const blurEffectCtx = blurEffectCanvas.getContext('2d');
const blurMaskCanvas = document.createElement('canvas');
const blurMaskCtx = blurMaskCanvas.getContext('2d');
const BLUR_RADIUS = 14;
const BLUR_FEATHER = 4;

const selectionBox = document.getElementById('selection-box');
const dimBadge = document.getElementById('dim-badge');
const aeroToolsBar = document.getElementById('aero-tools-bar');
const aeroActionsBar = document.getElementById('aero-actions-bar');
const recordingBar = document.getElementById('recording-bar');
const recTimer = document.getElementById('rec-timer');

// Buttons
const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
const btnClearAll = document.getElementById('btn-clear-all');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnCopy = document.getElementById('btn-copy');
const btnSave = document.getElementById('btn-save');
const btnRecordVideo = document.getElementById('btn-record-video');
const btnRecordGif = document.getElementById('btn-record-gif');
const btnClose = document.getElementById('btn-close');

// Size selector
const sizeTrigger = document.getElementById('size-trigger');
const sizePreviewDot = document.getElementById('size-preview-dot');
const sizePopup = document.getElementById('size-popup');
const sizeOptions = document.querySelectorAll('.size-option');

// Color picker
const colorTrigger = document.getElementById('color-trigger');
const currentColorDot = document.getElementById('current-color-dot');
const palettePopup = document.getElementById('palette-popup');
const colorOptions = document.querySelectorAll('.color-option');

// Recording controls
const recModeBadge = document.getElementById('rec-mode-badge');
const recDot = document.getElementById('rec-dot');
const btnRecPause = document.getElementById('btn-rec-pause');
const btnRecStop = document.getElementById('btn-rec-stop');
const btnRecCancel = document.getElementById('btn-rec-cancel');

// Post-Video Review Bar
const videoReviewBar = document.getElementById('video-review-bar');
const btnVideoCopyMp4 = document.getElementById('btn-video-copy-mp4');
const btnVideoCopyGif = document.getElementById('btn-video-copy-gif');
const btnVideoSaveMp4 = document.getElementById('btn-video-save-mp4');
const btnVideoSaveGif = document.getElementById('btn-video-save-gif');
const btnVideoDiscard = document.getElementById('btn-video-discard');
const videoQualityTag = document.getElementById('video-quality-tag');

// State
let overlayState = {
  mode: 'screenshot', // 'screenshot' | 'video'
  screenSourceId: null,
  displayWidth: window.innerWidth,
  displayHeight: window.innerHeight,
  scaleFactor: window.devicePixelRatio || 1,
  settings: {},
  
  // Selection box rect: { x, y, w, h }
  selection: null,
  isSelecting: false,
  isResizing: false,
  resizeHandle: null,
  isMoving: false,
  moveOffsetX: 0,
  moveOffsetY: 0,
  isSpacePressed: false,
  
  // Drag start
  startX: 0,
  startY: 0,
  
  // Annotation state
  activeTool: 'pen', // 'pen' | 'arrow' | 'counter' | 'blur-brush' | 'blur-rect' | 'rect' | 'text'
  activeColor: '#ef4444',
  lineWidth: 4,
  stepCount: 1,
  activeTextEditor: null,
  
  // History & Redo stacks for step-by-step undo/redo
  history: [],
  redoStack: [],
  currentPath: null,
  
  // Video recording
  mediaRecorder: null,
  stream: null,
  videoElem: null,
  isRecordingLoop: false,
  recordedChunks: [],
  recordedArrayBuffer: null,
  recStartTime: 0,
  recTimerInterval: null,
  isRecPaused: false,
  isNativeRecording: false,
  hasNativeRecording: false,
};

let annotationFrame = 0;
let isSavingScreenshot = false;

function requestAnnotationRedraw() {
  if (annotationFrame) return;
  annotationFrame = requestAnimationFrame(() => {
    annotationFrame = 0;
    redrawAnnotations();
  });
}

// Setup from Main Process
function initFromMain(data) {
  overlayState.selection = null;
  overlayState.isSelecting = false;
  overlayState.isResizing = false;
  overlayState.isMoving = false;
  overlayState.history = [];
  overlayState.redoStack = [];
  overlayState.currentPath = null;
  selectionBox.classList.add('hidden');
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  if (recordingBar) recordingBar.classList.add('hidden');
  if (videoReviewBar) videoReviewBar.classList.add('hidden');

  overlayState.mode = data.mode || 'screenshot';
  overlayState.screenSourceId = data.screenSourceId || null;
  overlayState.displayWidth = data.displayWidth || window.innerWidth;
  overlayState.displayHeight = data.displayHeight || window.innerHeight;
  overlayState.scaleFactor = data.scaleFactor || window.devicePixelRatio || 1;
  overlayState.settings = data.settings || {};

  configureCanvases();

  if (data.backgroundDataUrl) {
    const frozenScreen = new Image();
    frozenScreen.onload = () => {
      baseCtx.setTransform(1, 0, 0, 1, 0, 0);
      baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      baseCtx.drawImage(frozenScreen, 0, 0, baseCanvas.width, baseCanvas.height);
      URL.revokeObjectURL(data.backgroundDataUrl);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (window.aeroAPI && window.aeroAPI.overlayReady) window.aeroAPI.overlayReady();
      }));
    };
    frozenScreen.onerror = () => {
      if (window.aeroAPI && window.aeroAPI.overlayReady) window.aeroAPI.overlayReady();
    };
    frozenScreen.src = data.backgroundDataUrl;
  } else if (window.aeroAPI && window.aeroAPI.overlayReady) {
    window.aeroAPI.overlayReady();
  }

  if (overlayState.mode === 'video' && btnRecordVideo) {
    btnRecordVideo.classList.add('active');
  }
}

function configureCanvases() {
  const scale = overlayState.scaleFactor || 1;
  for (const canvas of [baseCanvas, drawCanvas]) {
    canvas.width = Math.round(window.innerWidth * scale);
    canvas.height = Math.round(window.innerHeight * scale);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }
  drawCtx.setTransform(scale, 0, 0, scale, 0, 0);
}

// Handle Direct IPC Init
window.addEventListener('DOMContentLoaded', () => {
  const scale = window.devicePixelRatio || 1;
  overlayState.scaleFactor = scale;
  configureCanvases();

  setupWindowEvents();
  setupToolbarEvents();

  if (window.aeroAPI && window.aeroAPI.onInitOverlay) {
    window.aeroAPI.onInitOverlay(initFromMain);
  }
});

// 1. Global hotkeys & listeners
function setupWindowEvents() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (overlayState.activeTextEditor) {
        discardInlineText();
      } else {
        closeOverlay();
      }
    } else if (e.code === 'Space' && !e.target.closest('input, textarea, [contenteditable="true"]')) {
      overlayState.isSpacePressed = true;
      document.body.classList.add('mode-moving');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoLastAction();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      if (overlayState.selection) copyScreenshot();
    } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
      if (overlayState.selection) saveScreenshot();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      overlayState.isSpacePressed = false;
      document.body.classList.remove('mode-moving');
    }
  });

  // Mouse interaction
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Double click anywhere before selection -> full screen select!
  window.addEventListener('dblclick', (e) => {
    if (!overlayState.selection || (overlayState.selection.w < 50 && overlayState.selection.h < 50)) {
      overlayState.selection = {
        x: 0,
        y: 0,
        w: window.innerWidth,
        h: window.innerHeight
      };
      updateSelectionBox();
    }
  });

  // Mouse wheel: quick adjust thickness
  window.addEventListener('wheel', (e) => {
    if (overlayState.selection && isPointInsideSelection(e.clientX, e.clientY)) {
      e.preventDefault();
      const sizes = [2, 4, 7, 12];
      let idx = sizes.indexOf(overlayState.lineWidth);
      if (idx === -1) idx = 1;
      if (e.deltaY < 0) {
        idx = Math.min(sizes.length - 1, idx + 1);
      } else {
        idx = Math.max(0, idx - 1);
      }
      setLineWidth(sizes[idx]);
    }
  }, { passive: false });

  // Правый клик в любом месте — отмена / закрытие оверлея
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (overlayState.activeTextEditor) {
      discardInlineText();
    } else {
      closeOverlay();
    }
  });
}

function setLineWidth(size) {
  overlayState.lineWidth = size;
  if (sizeOptions) {
    sizeOptions.forEach(opt => {
      if (parseInt(opt.getAttribute('data-size'), 10) === size) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }
  if (sizePreviewDot) {
    const dotSize = Math.min(18, Math.max(4, size * 1.8));
    sizePreviewDot.style.width = `${dotSize}px`;
    sizePreviewDot.style.height = `${dotSize}px`;
  }
}

// 2. Toolbar & Tool selection
function setupToolbarEvents() {
  // Prevent any clicks/mousedown inside toolbars and popups from bubbling to canvas selection
  [aeroToolsBar, aeroActionsBar, recordingBar, videoReviewBar, palettePopup, sizePopup].filter(Boolean).forEach(bar => {
    bar.addEventListener('mousedown', (e) => e.stopPropagation());
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  });

  toolButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      overlayState.activeTool = btn.getAttribute('data-tool');
    });
  });

  // Line Width / Size Trigger & Options
  if (sizeTrigger && sizePopup) {
    sizeTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      sizePopup.classList.toggle('hidden');
      if (palettePopup) palettePopup.classList.add('hidden');
    });

    sizeOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const size = parseInt(opt.getAttribute('data-size'), 10) || 4;
        setLineWidth(size);
        sizePopup.classList.add('hidden');
      });
    });
  }

  // Color palette trigger
  colorTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    palettePopup.classList.toggle('hidden');
    if (sizePopup) sizePopup.classList.add('hidden');
  });

  colorOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = opt.getAttribute('data-color');
      overlayState.activeColor = color;
      currentColorDot.style.background = color;
      palettePopup.classList.add('hidden');
    });
  });

  // Click outside to close popups
  document.addEventListener('click', () => {
    if (palettePopup) palettePopup.classList.add('hidden');
    if (sizePopup) sizePopup.classList.add('hidden');
  });

  // Actions
  if (btnClearAll) {
    btnClearAll.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllAnnotations();
    });
  }

  if (btnUndo) {
    btnUndo.addEventListener('click', (e) => {
      e.stopPropagation();
      undoLastAction();
    });
  }

  if (btnRedo) {
    btnRedo.addEventListener('click', (e) => {
      e.stopPropagation();
      redoLastAction();
    });
  }

  updateUndoRedoButtons();

  btnCopy.addEventListener('click', (e) => {
    e.stopPropagation();
    copyScreenshot();
  });

  btnSave.addEventListener('click', (e) => {
    e.stopPropagation();
    saveScreenshot();
  });

  if (btnRecordVideo) {
    btnRecordVideo.addEventListener('click', (e) => {
      e.stopPropagation();
      startVideoRecording('mp4');
    });
  }

  if (btnRecordGif) {
    btnRecordGif.addEventListener('click', (e) => {
      e.stopPropagation();
      startVideoRecording('gif');
    });
  }

  if (btnRecPause) {
    btnRecPause.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePauseVideo();
    });
  }

  if (btnRecStop) {
    btnRecStop.addEventListener('click', (e) => {
      e.stopPropagation();
      stopVideoRecording();
    });
  }

  if (btnRecCancel) {
    btnRecCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelRecording();
    });
  }

  btnClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeOverlay();
  });

  // Post-Video Review Actions (MP4 / GIF)
  if (btnVideoCopyMp4) {
    btnVideoCopyMp4.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (overlayState.hasNativeRecording) {
        await exportNativeRecording('mp4', true);
        return;
      }
      if (overlayState.recordedArrayBuffer && window.aeroAPI) {
        await window.aeroAPI.saveVideo(overlayState.recordedArrayBuffer, 'mp4');
        closeOverlay();
      }
    });
  }

  if (btnVideoCopyGif) {
    btnVideoCopyGif.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (overlayState.hasNativeRecording) {
        await exportNativeRecording('gif', true);
        return;
      }
      if (overlayState.recordedArrayBuffer && window.aeroAPI) {
        await window.aeroAPI.saveVideo(overlayState.recordedArrayBuffer, 'gif');
        closeOverlay();
      }
    });
  }

  if (btnVideoSaveMp4) {
    btnVideoSaveMp4.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (overlayState.hasNativeRecording) {
        await exportNativeRecording('mp4', false);
        return;
      }
      if (overlayState.recordedArrayBuffer && window.aeroAPI) {
        await window.aeroAPI.saveVideo(overlayState.recordedArrayBuffer, 'mp4');
        closeOverlay();
      }
    });
  }

  if (btnVideoSaveGif) {
    btnVideoSaveGif.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (overlayState.hasNativeRecording) {
        await exportNativeRecording('gif', false);
        return;
      }
      if (overlayState.recordedArrayBuffer && window.aeroAPI) {
        await window.aeroAPI.saveVideo(overlayState.recordedArrayBuffer, 'gif');
        closeOverlay();
      }
    });
  }

  if (btnVideoDiscard) {
    btnVideoDiscard.addEventListener('click', (e) => {
      e.stopPropagation();
      closeOverlay();
    });
  }

  // Resize handles
  document.querySelectorAll('.handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      overlayState.isResizing = true;
      overlayState.resizeHandle = handle.getAttribute('data-handle');
      overlayState.startMouse = { x: e.clientX, y: e.clientY };
      overlayState.startBox = overlayState.selection ? { ...overlayState.selection } : null;
    });
  });
}

// Check if mouse point is on or near the dashed border line
function isPointOnBorder(x, y) {
  if (!overlayState.selection) return false;
  const { x: sx, y: sy, w: sw, h: sh } = overlayState.selection;
  const borderHitWidth = 9; // 9px hit area for dashed line

  const nearLeft = Math.abs(x - sx) <= borderHitWidth && y >= sy - borderHitWidth && y <= sy + sh + borderHitWidth;
  const nearRight = Math.abs(x - (sx + sw)) <= borderHitWidth && y >= sy - borderHitWidth && y <= sy + sh + borderHitWidth;
  const nearTop = Math.abs(y - sy) <= borderHitWidth && x >= sx - borderHitWidth && x <= sx + sw + borderHitWidth;
  const nearBottom = Math.abs(y - (sy + sh)) <= borderHitWidth && x >= sx - borderHitWidth && x <= sx + sw + borderHitWidth;

  return nearLeft || nearRight || nearTop || nearBottom;
}

// 3. Selection & Canvas Mouse Handling
function onMouseDown(e) {
  if (
    e.target.closest('.aero-tools-bar') ||
    e.target.closest('.aero-actions-bar') ||
    e.target.closest('.aero-toolbar') ||
    e.target.closest('.tool-btn') ||
    e.target.closest('.recording-bar') ||
    e.target.closest('.video-review-bar') ||
    e.target.closest('.handle') ||
    e.target.closest('.size-popup') ||
    e.target.closest('.palette-popup') ||
    e.target.closest('.color-palette-popup') ||
    e.target.closest('.canvas-inline-editor')
  ) {
    return;
  }

  const { clientX: x, clientY: y } = e;

  // If no selection yet, start creating one
  if (!overlayState.selection) {
    overlayState.isSelecting = true;
    overlayState.startX = x;
    overlayState.startY = y;
    overlayState.selection = { x, y, w: 0, h: 0 };
    updateSelectionBox();
    return;
  }

  // 1. Direct border / dimension badge dragging (Перетаскивание за пунктир)
  if (isPointOnBorder(x, y) || e.target.closest('.dimension-badge') || overlayState.isSpacePressed) {
    overlayState.isMoving = true;
    overlayState.moveOffsetX = x - overlayState.selection.x;
    overlayState.moveOffsetY = y - overlayState.selection.y;
    return;
  }

  // 2. If clicking inside existing selection -> draw annotations
  if (isPointInsideSelection(x, y)) {
    if (overlayState.activeTool === 'counter') {
      addCounterBadge(x, y);
    } else if (overlayState.activeTool === 'text') {
      startInlineTextEditor(x, y);
    } else {
      // Pen / Arrow / Blur / Rect
      overlayState.currentPath = {
        tool: overlayState.activeTool,
        color: overlayState.activeColor,
        width: overlayState.lineWidth,
        points: [{ x, y }],
        startX: x,
        startY: y,
        currentX: x,
        currentY: y
      };
    }
  } else {
    // Clicking outside selection: start new selection
    overlayState.isSelecting = true;
    overlayState.startX = x;
    overlayState.startY = y;
    overlayState.selection = { x, y, w: 0, h: 0 };
    overlayState.history = [];
    overlayState.stepCount = 1;
    clearDrawCanvas();
    updateSelectionBox();
  }
}

function onMouseMove(e) {
  const { clientX: x, clientY: y } = e;

  // 1. Moving entire selection box (Spacebar drag)
  if (overlayState.isMoving && overlayState.selection) {
    const newX = Math.max(0, Math.min(window.innerWidth - overlayState.selection.w, x - overlayState.moveOffsetX));
    const newY = Math.max(0, Math.min(window.innerHeight - overlayState.selection.h, y - overlayState.moveOffsetY));
    overlayState.selection.x = newX;
    overlayState.selection.y = newY;
    updateSelectionBox();
    return;
  }

  // 2. Making new selection
  if (overlayState.isSelecting) {
    const left = Math.min(overlayState.startX, x);
    const top = Math.min(overlayState.startY, y);
    const width = Math.abs(x - overlayState.startX);
    const height = Math.abs(y - overlayState.startY);

    overlayState.selection = { x: left, y: top, w: width, h: height };
    updateSelectionBox();
    return;
  }

  // 3. Resizing selection
  if (overlayState.isResizing && overlayState.selection) {
    handleResize(x, y);
    updateSelectionBox();
    return;
  }

  // 4. Drawing tool path
  if (overlayState.currentPath) {
    overlayState.currentPath.currentX = x;
    overlayState.currentPath.currentY = y;
    if (overlayState.currentPath.tool === 'pen' || overlayState.currentPath.tool === 'blur-brush') {
      overlayState.currentPath.points.push({ x, y });
    }
    requestAnnotationRedraw();
  }

  // 5. Dynamic cursor hover: dashed border / dim badge shows 'move' cursor
  if (!overlayState.isSelecting && !overlayState.isResizing && !overlayState.isMoving && !overlayState.currentPath && overlayState.selection) {
    if (e.target.closest('.handle')) {
      // Handled by handle CSS
    } else if (isPointOnBorder(x, y) || e.target.closest('.dimension-badge')) {
      document.body.style.cursor = 'move';
    } else {
      document.body.style.cursor = 'crosshair';
    }
  }
}

function onMouseUp(e) {
  if (overlayState.isMoving) {
    overlayState.isMoving = false;
  }

  if (overlayState.isSelecting) {
    overlayState.isSelecting = false;
    if (overlayState.selection && (overlayState.selection.w < 15 || overlayState.selection.h < 15)) {
      // Too small, reset
      overlayState.selection = null;
      selectionBox.classList.add('hidden');
    }
  }

  if (overlayState.isResizing) {
    overlayState.isResizing = false;
    overlayState.resizeHandle = null;
  }

  if (overlayState.currentPath) {
    overlayState.history.push(overlayState.currentPath);
    overlayState.redoStack = [];
    overlayState.currentPath = null;
    redrawAnnotations();
    updateUndoRedoButtons();
  }
}

function isPointInsideSelection(x, y) {
  if (!overlayState.selection) return false;
  const { x: sx, y: sy, w: sw, h: sh } = overlayState.selection;
  return x >= sx && x <= sx + sw && y >= sy && y <= sy + sh;
}

function updateSelectionBox() {
  if (!overlayState.selection) {
    selectionBox.classList.add('hidden');
    return;
  }

  const { x, y, w, h } = overlayState.selection;
  selectionBox.classList.remove('hidden');
  selectionBox.style.left = `${x}px`;
  selectionBox.style.top = `${y}px`;
  selectionBox.style.width = `${w}px`;
  selectionBox.style.height = `${h}px`;

  dimBadge.textContent = `${Math.round(w)} × ${Math.round(h)} px`;

  // Dynamic layout & positioning of aeroToolbar (bottom or side based on selection ratio & screen borders)
  positionAdaptiveToolbar(x, y, w, h);
}

function positionAdaptiveToolbar(x, y, w, h) {
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  if (!aeroToolsBar || !aeroActionsBar) return;

  // 1. POSITION VERTICAL ACTIONS BAR (Right side: Save -> GIF -> Video -> Copy)
  const spaceRight = winW - (x + w);
  const spaceLeft = x;

  if (spaceRight >= 54) {
    // Outside right
    aeroActionsBar.style.left = `${w + 10}px`;
    aeroActionsBar.style.right = 'auto';
  } else if (spaceLeft >= 54) {
    // Outside left
    aeroActionsBar.style.left = '-52px';
    aeroActionsBar.style.right = 'auto';
  } else {
    // Inside right
    aeroActionsBar.style.left = 'auto';
    aeroActionsBar.style.right = '8px';
  }

  // Actions bar vertical alignment (Всегда прижата к нижнему краю рамки)
  aeroActionsBar.style.top = 'auto';
  aeroActionsBar.style.bottom = '0px';

  // 2. POSITION HORIZONTAL TOOLS BAR (Bottom of selection: Tools + Close)
  const spaceBottom = winH - (y + h);
  const spaceTop = y;

  if (spaceBottom >= 54) {
    // Outside bottom
    aeroToolsBar.style.top = `${h + 10}px`;
    aeroToolsBar.style.bottom = 'auto';
  } else if (spaceTop >= 54) {
    // Outside top
    aeroToolsBar.style.top = '-50px';
    aeroToolsBar.style.bottom = 'auto';
  } else {
    // Inside bottom
    aeroToolsBar.style.top = 'auto';
    aeroToolsBar.style.bottom = '8px';
  }

  // Tools bar horizontal alignment (Всегда строго по центру рамки!)
  aeroToolsBar.style.left = '50%';
  aeroToolsBar.style.right = 'auto';
  aeroToolsBar.style.transform = 'translateX(-50%)';
}

function handleResize(x, y) {
  const handle = overlayState.resizeHandle;
  const s = overlayState.selection;
  const sb = overlayState.startBox;
  const sm = overlayState.startMouse;
  if (!s || !sb || !sm) return;

  const dx = x - sm.x;
  const dy = y - sm.y;

  if (handle.includes('e')) {
    s.w = Math.max(25, sb.w + dx);
  }
  if (handle.includes('s')) {
    s.h = Math.max(25, sb.h + dy);
  }
  if (handle.includes('w')) {
    const newW = Math.max(25, sb.w - dx);
    s.x = sb.x + (sb.w - newW);
    s.w = newW;
  }
  if (handle.includes('n')) {
    const newH = Math.max(25, sb.h - dy);
    s.y = sb.y + (sb.h - newH);
    s.h = newH;
  }
}

// 4. Drawing & Annotations Engine
function clearDrawCanvas() {
  drawCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

function redrawAnnotations(includeBlur = true) {
  clearDrawCanvas();

  for (const item of overlayState.history) {
    drawItem(item, false, includeBlur);
  }
  if (overlayState.currentPath) {
    drawItem(overlayState.currentPath, true, includeBlur);
  }
}

function drawItem(item, isDraft = false, includeBlur = true) {
  drawCtx.save();

  if (item.tool === 'pen') {
    drawCtx.strokeStyle = item.color;
    drawCtx.lineWidth = item.width || 3;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    if (item.points.length > 1) {
      drawCtx.beginPath();
      drawCtx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) {
        drawCtx.lineTo(item.points[i].x, item.points[i].y);
      }
      drawCtx.stroke();
    }
  } else if (item.tool === 'blur-brush') {
    if (includeBlur) {
      drawSmoothBlur(drawCtx, baseCanvas, item, 0, 0, overlayState.scaleFactor || 1);
    }
  } else if (item.tool === 'arrow') {
    drawArrow(item.startX, item.startY, item.currentX, item.currentY, item.color, item.width || 4);
  } else if (item.tool === 'counter') {
    drawCounterBadge(item.x, item.y, item.num, item.color, item.width || 4);
  } else if (item.tool === 'blur' || item.tool === 'blur-rect') {
    if (includeBlur) {
      drawSmoothBlur(drawCtx, baseCanvas, item, 0, 0, overlayState.scaleFactor || 1);
    }
    if (isDraft) {
      drawBlurSelectionGuide(item.startX, item.startY, item.currentX, item.currentY);
    }
  } else if (item.tool === 'rect') {
    drawCtx.strokeStyle = item.color;
    drawCtx.lineWidth = item.width || 4;
    const rx = Math.min(item.startX, item.currentX);
    const ry = Math.min(item.startY, item.currentY);
    const rw = Math.abs(item.currentX - item.startX);
    const rh = Math.abs(item.currentY - item.startY);
    drawCtx.strokeRect(rx, ry, rw, rh);
  } else if (item.tool === 'text') {
    drawCtx.fillStyle = item.color;
    const fSize = item.fontSize || Math.round(13 + (item.width || 4) * 2.2);
    drawCtx.font = `bold ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    drawCtx.textBaseline = 'top';
    const lines = (item.text || '').split('\n');
    const lineHeight = fSize * 1.25;
    for (let i = 0; i < lines.length; i++) {
      drawCtx.fillText(lines[i], item.x, item.y + (i * lineHeight));
    }
  }

  drawCtx.restore();
}

function clearAllAnnotations() {
  overlayState.history = [];
  overlayState.redoStack = [];
  overlayState.currentPath = null;
  overlayState.stepCount = 1;
  clearDrawCanvas();
  updateUndoRedoButtons();
}

function getBlurBounds(item) {
  if (item.tool === 'blur-brush') {
    const points = item.points || [];
    if (!points.length) return null;
    const radius = Math.max(12, (item.width || 4) * 3);
    let left = points[0].x;
    let top = points[0].y;
    let right = points[0].x;
    let bottom = points[0].y;
    for (let index = 1; index < points.length; index++) {
      const point = points[index];
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
    return {
      left: left - radius,
      top: top - radius,
      right: right + radius,
      bottom: bottom + radius,
      radius
    };
  }

  return {
    left: Math.min(item.startX, item.currentX),
    top: Math.min(item.startY, item.currentY),
    right: Math.max(item.startX, item.currentX),
    bottom: Math.max(item.startY, item.currentY),
    radius: 0
  };
}

function drawSmoothBlur(targetCtx, sourceCanvas, item, originX, originY, scale) {
  const bounds = getBlurBounds(item);
  if (!bounds || bounds.right - bounds.left < 2 || bounds.bottom - bounds.top < 2) return;

  // Capture a padded source region so the Gaussian kernel always has real
  // neighbouring pixels at the visible mask edge.
  const padding = BLUR_RADIUS * 3 + BLUR_FEATHER + 2;
  const sourceWidth = sourceCanvas.width / scale;
  const sourceHeight = sourceCanvas.height / scale;
  const left = Math.max(0, bounds.left - originX - padding);
  const top = Math.max(0, bounds.top - originY - padding);
  const right = Math.min(sourceWidth, bounds.right - originX + padding);
  const bottom = Math.min(sourceHeight, bounds.bottom - originY + padding);
  if (right <= left || bottom <= top) return;

  const sourceX = Math.floor(left * scale);
  const sourceY = Math.floor(top * scale);
  const width = Math.max(1, Math.ceil((right - left) * scale));
  const height = Math.max(1, Math.ceil((bottom - top) * scale));
  blurEffectCanvas.width = width;
  blurEffectCanvas.height = height;
  blurMaskCanvas.width = width;
  blurMaskCanvas.height = height;

  blurEffectCtx.save();
  blurEffectCtx.filter = `blur(${BLUR_RADIUS * scale}px)`;
  blurEffectCtx.drawImage(sourceCanvas, sourceX, sourceY, width, height, 0, 0, width, height);
  blurEffectCtx.restore();

  blurMaskCtx.save();
  blurMaskCtx.filter = `blur(${BLUR_FEATHER * scale}px)`;
  blurMaskCtx.fillStyle = '#fff';
  blurMaskCtx.strokeStyle = '#fff';
  blurMaskCtx.lineCap = 'round';
  blurMaskCtx.lineJoin = 'round';
  if (item.tool === 'blur-brush') {
    const points = item.points || [];
    const diameter = Math.max(24, (item.width || 4) * 6) * scale;
    blurMaskCtx.lineWidth = diameter;
    blurMaskCtx.beginPath();
    points.forEach((point, index) => {
      const px = (point.x - originX - left) * scale;
      const py = (point.y - originY - top) * scale;
      if (index === 0) blurMaskCtx.moveTo(px, py);
      else blurMaskCtx.lineTo(px, py);
    });
    if (points.length === 1) {
      const point = points[0];
      blurMaskCtx.arc(
        (point.x - originX - left) * scale,
        (point.y - originY - top) * scale,
        diameter / 2,
        0,
        Math.PI * 2
      );
      blurMaskCtx.fill();
    } else {
      blurMaskCtx.stroke();
    }
  } else {
    const inset = BLUR_FEATHER;
    const x = (bounds.left - originX - left + inset) * scale;
    const y = (bounds.top - originY - top + inset) * scale;
    const w = Math.max(1, (bounds.right - bounds.left - inset * 2) * scale);
    const h = Math.max(1, (bounds.bottom - bounds.top - inset * 2) * scale);
    blurMaskCtx.fillRect(x, y, w, h);
  }
  blurMaskCtx.restore();

  blurEffectCtx.save();
  blurEffectCtx.globalCompositeOperation = 'destination-in';
  blurEffectCtx.drawImage(blurMaskCanvas, 0, 0);
  blurEffectCtx.restore();

  targetCtx.save();
  targetCtx.setTransform(1, 0, 0, 1, 0, 0);
  targetCtx.drawImage(blurEffectCanvas, sourceX, sourceY);
  targetCtx.restore();
}

function drawBlurSelectionGuide(x1, y1, x2, y2) {
  const bx = Math.min(x1, x2);
  const by = Math.min(y1, y2);
  const bw = Math.abs(x2 - x1);
  const bh = Math.abs(y2 - y1);

  if (bw < 4 || bh < 4) return;

  drawCtx.save();
  drawCtx.strokeStyle = 'rgba(104, 223, 245, 0.95)';
  drawCtx.lineWidth = 1.5;
  drawCtx.setLineDash([6, 4]);
  drawCtx.strokeRect(bx, by, bw, bh);
  drawCtx.restore();
}

function drawArrow(fromX, fromY, toX, toY, color, width) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return;

  const w = width || 4;
  const headLength = Math.min(dist * 0.5, Math.max(14, w * 3.2));
  const headWidth = headLength * 0.55;

  const ux = dx / dist;
  const uy = dy / dist;
  const vx = -uy;
  const vy = ux;

  // Neck where line stops (so line does NOT poke through the tip)
  const neckX = toX - ux * (headLength * 0.65);
  const neckY = toY - uy * (headLength * 0.65);

  drawCtx.save();
  drawCtx.strokeStyle = color;
  drawCtx.fillStyle = color;

  // 1. Draw smooth shaft
  drawCtx.lineWidth = w;
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.beginPath();
  drawCtx.moveTo(fromX, fromY);
  drawCtx.lineTo(neckX, neckY);
  drawCtx.stroke();

  // 2. Draw perfectly symmetric sleek chevron arrowhead
  const leftX = toX - ux * headLength + vx * headWidth;
  const leftY = toY - uy * headLength + vy * headWidth;
  const rightX = toX - ux * headLength - vx * headWidth;
  const rightY = toY - uy * headLength - vy * headWidth;
  const notchX = toX - ux * (headLength * 0.72);
  const notchY = toY - uy * (headLength * 0.72);

  drawCtx.beginPath();
  drawCtx.moveTo(toX, toY);
  drawCtx.lineTo(leftX, leftY);
  drawCtx.lineTo(notchX, notchY);
  drawCtx.lineTo(rightX, rightY);
  drawCtx.closePath();
  drawCtx.fill();
  drawCtx.restore();
}

function drawCounterBadge(x, y, num, color, width) {
  const w = width || 4;
  const radius = Math.round(11 + w * 1.4);
  const borderWidth = Math.max(1.5, Math.round(w * 0.35));
  const fontSize = Math.round(11 + w * 1.15);

  drawCtx.save();
  drawCtx.shadowColor = 'rgba(0,0,0,0.35)';
  drawCtx.shadowBlur = Math.round(3 + w * 0.4);
  drawCtx.shadowOffsetY = Math.round(1 + w * 0.3);

  // Circle
  drawCtx.fillStyle = color;
  drawCtx.beginPath();
  drawCtx.arc(x, y, radius, 0, Math.PI * 2);
  drawCtx.fill();

  // White border
  drawCtx.lineWidth = borderWidth;
  drawCtx.strokeStyle = '#ffffff';
  drawCtx.stroke();

  // Text
  drawCtx.shadowColor = 'transparent';
  drawCtx.fillStyle = '#ffffff';
  drawCtx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
  drawCtx.textAlign = 'center';
  drawCtx.textBaseline = 'middle';
  drawCtx.fillText(num.toString(), x, y + 1);
  drawCtx.restore();
}

function addCounterBadge(x, y) {
  overlayState.history.push({
    tool: 'counter',
    x,
    y,
    num: overlayState.stepCount++,
    color: overlayState.activeColor,
    width: overlayState.lineWidth
  });
  overlayState.redoStack = [];
  redrawAnnotations();
  updateUndoRedoButtons();
}

function startInlineTextEditor(x, y) {
  if (overlayState.activeTextEditor) {
    commitInlineText();
  }

  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.className = 'canvas-inline-editor';
  editor.style.left = `${x}px`;
  editor.style.top = `${y}px`;
  editor.style.color = overlayState.activeColor;
  const fontSize = Math.round(13 + (overlayState.lineWidth || 4) * 2.2);
  editor.style.fontSize = `${fontSize}px`;
  document.body.appendChild(editor);

  overlayState.activeTextEditor = {
    element: editor,
    x: x + 6,
    y: y + 3,
    fontSize,
    color: overlayState.activeColor,
    width: overlayState.lineWidth
  };

  setTimeout(() => {
    editor.focus();
  }, 15);

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitInlineText();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      discardInlineText();
    }
  });

  editor.addEventListener('blur', () => {
    setTimeout(commitInlineText, 150);
  });
}

function commitInlineText() {
  if (!overlayState.activeTextEditor) return;
  const { element, x, y, fontSize, color, width } = overlayState.activeTextEditor;
  const text = element.innerText ? element.innerText.trim() : '';
  if (element.parentNode) element.parentNode.removeChild(element);
  overlayState.activeTextEditor = null;

  if (text) {
    overlayState.history.push({
      tool: 'text',
      x,
      y,
      text,
      fontSize,
      color,
      width
    });
    overlayState.redoStack = [];
    redrawAnnotations();
    updateUndoRedoButtons();
  }
}

function discardInlineText() {
  if (!overlayState.activeTextEditor) return;
  const { element } = overlayState.activeTextEditor;
  if (element.parentNode) element.parentNode.removeChild(element);
  overlayState.activeTextEditor = null;
}

function undoLastAction() {
  if (overlayState.history.length > 0) {
    const removed = overlayState.history.pop();
    overlayState.redoStack.push(removed);
    if (removed.tool === 'counter' && overlayState.stepCount > 1) {
      overlayState.stepCount--;
    }
    redrawAnnotations();
    updateUndoRedoButtons();
  }
}

function redoLastAction() {
  if (overlayState.redoStack.length > 0) {
    const item = overlayState.redoStack.pop();
    if (item.tool === 'counter') {
      item.num = overlayState.stepCount++;
    }
    overlayState.history.push(item);
    redrawAnnotations();
    updateUndoRedoButtons();
  }
}

function updateUndoRedoButtons() {
  if (btnUndo) {
    btnUndo.style.opacity = overlayState.history.length > 0 ? '1' : '0.35';
    btnUndo.style.pointerEvents = overlayState.history.length > 0 ? 'auto' : 'none';
  }
  if (btnRedo) {
    btnRedo.style.opacity = overlayState.redoStack.length > 0 ? '1' : '0.35';
    btnRedo.style.pointerEvents = overlayState.redoStack.length > 0 ? 'auto' : 'none';
  }
}

// 5. Output Engine: Merge Live Screen Capture with Annotations
async function createMergedScreenshot() {
  if (!overlayState.selection) return null;
  const { x, y, w, h } = overlayState.selection;
  const scale = overlayState.scaleFactor;

  // Grab pristine screen crop directly from Main process
  if (!window.aeroAPI || !window.aeroAPI.grabScreenRect) return null;

  const rawCropDataUrl = await window.aeroAPI.grabScreenRect({ x, y, w, h });
  if (!rawCropDataUrl) return null;

  const cropImage = new Image();
  await new Promise((resolve, reject) => {
    cropImage.onload = resolve;
    cropImage.onerror = reject;
    cropImage.src = rawCropDataUrl;
  });

  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = Math.round(w * scale);
  mergedCanvas.height = Math.round(h * scale);
  const mCtx = mergedCanvas.getContext('2d');

  // 1. Draw raw live screen crop
  mCtx.drawImage(cropImage, 0, 0, mergedCanvas.width, mergedCanvas.height);

  // 2. Apply the same padded Gaussian blur used by the live editor.
  const pristineCanvas = document.createElement('canvas');
  pristineCanvas.width = mergedCanvas.width;
  pristineCanvas.height = mergedCanvas.height;
  pristineCanvas.getContext('2d').drawImage(mergedCanvas, 0, 0);
  for (const item of overlayState.history) {
    if (item.tool === 'blur' || item.tool === 'blur-rect' || item.tool === 'blur-brush') {
      drawSmoothBlur(mCtx, pristineCanvas, item, x, y, scale);
    }
  }

  // 3. Draw only regular annotations on top. Temporary blur guides are never
  // exported and the blur layer is not composited twice.
  redrawAnnotations(false);
  mCtx.drawImage(
    drawCanvas,
    Math.round(x * scale),
    Math.round(y * scale),
    Math.round(w * scale),
    Math.round(h * scale),
    0,
    0,
    mergedCanvas.width,
    mergedCanvas.height
  );
  redrawAnnotations(true);

  return mergedCanvas.toDataURL('image/png');
}

async function copyScreenshot() {
  try {
    const finalDataUrl = await createMergedScreenshot();
    if (!finalDataUrl) return;

    if (window.aeroAPI) {
      await window.aeroAPI.copyScreenshot(finalDataUrl);
      closeOverlay();
    }
  } catch (e) {
    console.error('Error copying screenshot:', e);
    showOverlayMessage(`Не удалось скопировать снимок: ${e}`, true);
  }
}

async function saveScreenshot() {
  if (isSavingScreenshot) return;
  isSavingScreenshot = true;
  if (btnSave) btnSave.disabled = true;
  try {
    const finalDataUrl = await createMergedScreenshot();
    if (!finalDataUrl) return;

    if (!window.aeroAPI || !window.aeroAPI.saveScreenshotAs) {
      throw new Error('Системный диалог сохранения недоступен');
    }
    const result = await window.aeroAPI.saveScreenshotAs(finalDataUrl);
    if (result) closeOverlay();
  } catch (e) {
    console.error('Error saving screenshot:', e);
    showOverlayMessage(`Не удалось сохранить снимок: ${e}`, true);
  } finally {
    isSavingScreenshot = false;
    if (btnSave) btnSave.disabled = false;
  }
}

function showOverlayMessage(message, isError = false) {
  let notice = document.getElementById('overlay-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'overlay-notice';
    notice.className = 'overlay-notice';
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.classList.add('show');
  clearTimeout(notice._timer);
  notice._timer = setTimeout(() => notice.classList.remove('show'), 4500);
}

function closeOverlay() {
  if (overlayState.mediaRecorder && overlayState.mediaRecorder.state !== 'inactive') {
    stopVideoRecording();
  }
  if (window.aeroAPI) {
    Promise.resolve(window.aeroAPI.closeOverlay()).finally(() => {
      // Keep the preloaded WebView, but release the full-screen pixel buffers.
      baseCanvas.width = 1;
      baseCanvas.height = 1;
      drawCanvas.width = 1;
      drawCanvas.height = 1;
      blurEffectCanvas.width = 1;
      blurEffectCanvas.height = 1;
      blurMaskCanvas.width = 1;
      blurMaskCanvas.height = 1;
    });
  }
}

// 6. Video & GIF Recording Engine (Crop Live Desktop)
async function startVideoRecording(format = 'mp4') {
  if (!overlayState.selection) {
    // If no box selected, select active display region
    overlayState.selection = {
      x: 0,
      y: 0,
      w: window.innerWidth,
      h: window.innerHeight
    };
    updateSelectionBox();
  }

  if (window.aeroAPI && window.aeroAPI.nativeRecording) {
    return startNativeRecording(format);
  }

  overlayState.recordingFormat = format;

  const { x, y, w, h } = overlayState.selection;
  const scale = overlayState.scaleFactor;
  const targetW = Math.max(20, Math.round(w * scale));
  const targetH = Math.max(20, Math.round(h * scale));

  try {
    let stream = null;

    // Fetch screenSourceId on-demand if not already cached
    if (!overlayState.screenSourceId && window.aeroAPI && window.aeroAPI.getDesktopSources) {
      try {
        const sources = await window.aeroAPI.getDesktopSources();
        if (sources && sources.length > 0) {
          overlayState.screenSourceId = sources[0].id;
        }
      } catch (e) {
        console.warn('[Video] Error getting desktop sources on demand:', e);
      }
    }

    if (overlayState.screenSourceId) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: overlayState.screenSourceId,
            minWidth: Math.round(overlayState.displayWidth * scale),
            maxWidth: Math.round(overlayState.displayWidth * scale),
            minHeight: Math.round(overlayState.displayHeight * scale),
            maxHeight: Math.round(overlayState.displayHeight * scale),
            maxFrameRate: 30
          }
        }
      });
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: 30 },
        audio: false
      });
    }

    // UI: Hide toolbars immediately
    if (aeroToolsBar) aeroToolsBar.classList.add('hidden');
    if (aeroActionsBar) aeroActionsBar.classList.add('hidden');

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    // Offscreen canvas for cropping live video to selected frame
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = targetW;
    cropCanvas.height = targetH;
    const cropCtx = cropCanvas.getContext('2d', { alpha: false });

    overlayState.isRecordingLoop = true;
    const cropX = Math.round(x * scale);
    const cropY = Math.round(y * scale);

    function renderCropLoop() {
      if (!overlayState.isRecordingLoop) return;
      // 1. Draw live screen crop frame
      cropCtx.drawImage(video, cropX, cropY, targetW, targetH, 0, 0, targetW, targetH);
      // 2. Composite annotations/blur drawn on canvas on top of video
      cropCtx.drawImage(drawCanvas, cropX, cropY, targetW, targetH, 0, 0, targetW, targetH);
      requestAnimationFrame(renderCropLoop);
    }
    renderCropLoop();

    const croppedStream = cropCanvas.captureStream(30);
    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
      mimeType = 'video/webm; codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
      mimeType = 'video/webm; codecs=vp8';
    }

    const mediaRecorder = new MediaRecorder(croppedStream, { mimeType });
    overlayState.mediaRecorder = mediaRecorder;
    overlayState.stream = stream;
    overlayState.videoElem = video;
    overlayState.recordedChunks = [];
    overlayState.isCancelled = false;

    // Mode badge in recording bar
    if (recModeBadge) {
      recModeBadge.textContent = format === 'gif' ? 'GIF' : 'MP4';
      recModeBadge.style.background = format === 'gif' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    }
    if (recDot) {
      recDot.style.background = format === 'gif' ? '#a855f7' : '#ef4444';
    }

    // Show floating recording bar
    recordingBar.classList.remove('hidden');

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        overlayState.recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      overlayState.isRecordingLoop = false;
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (video) {
        video.pause();
        video.srcObject = null;
      }

      if (overlayState.isCancelled) {
        recordingBar.classList.add('hidden');
        return;
      }

      const blob = new Blob(overlayState.recordedChunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      overlayState.recordedArrayBuffer = arrayBuffer;

      if (window.SoundSynth) {
        window.SoundSynth.playVideoStop();
      }

      // Hide recording bar & reveal Post-Video Review bar
      recordingBar.classList.add('hidden');
      if (videoReviewBar) {
        videoReviewBar.classList.remove('hidden');
      }
    };

    mediaRecorder.start(100);
    overlayState.recStartTime = Date.now();
    startRecTimer();

    if (window.SoundSynth) {
      window.SoundSynth.playVideoStart();
    }
  } catch (e) {
    console.error('Error starting video recording:', e);
    if (aeroToolsBar) aeroToolsBar.classList.remove('hidden');
    if (aeroActionsBar) aeroActionsBar.classList.remove('hidden');
    recordingBar.classList.add('hidden');
  }
}

async function startNativeRecording(format) {
  if (overlayState.isNativeRecording) return;
  try {
    overlayState.recordingFormat = format;
    await window.aeroAPI.recordingStart(overlayState.selection);
    overlayState.isNativeRecording = true;
    overlayState.hasNativeRecording = false;
    overlayState.isRecPaused = false;
    if (aeroToolsBar) aeroToolsBar.classList.add('hidden');
    if (aeroActionsBar) aeroActionsBar.classList.add('hidden');
    if (recModeBadge) {
      recModeBadge.textContent = format === 'gif' ? 'GIF' : 'MP4';
      recModeBadge.style.background = format === 'gif'
        ? 'rgba(168, 85, 247, 0.4)'
        : 'rgba(239, 68, 68, 0.4)';
    }
    if (recDot) recDot.style.background = format === 'gif' ? '#a855f7' : '#ef4444';
    recordingBar.classList.remove('hidden');
    overlayState.recStartTime = Date.now();
    startRecTimer();
    if (window.SoundSynth) window.SoundSynth.playVideoStart();
  } catch (error) {
    console.error('Error starting native recording:', error);
    if (aeroToolsBar) aeroToolsBar.classList.remove('hidden');
    if (aeroActionsBar) aeroActionsBar.classList.remove('hidden');
    recordingBar.classList.add('hidden');
  }
}

async function exportNativeRecording(format, copyPath) {
  try {
    await window.aeroAPI.recordingExport(format, copyPath);
    closeOverlay();
  } catch (error) {
    console.error('Error exporting native recording:', error);
  }
}

function startRecTimer() {
  overlayState.recTimerInterval = setInterval(() => {
    if (overlayState.isRecPaused) return;
    const elapsed = Math.floor((Date.now() - overlayState.recStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    recTimer.textContent = `${mins}:${secs}`;
  }, 500);
}

function togglePauseVideo() {
  if (overlayState.isNativeRecording) {
    window.aeroAPI.recordingTogglePause().then((paused) => {
      overlayState.isRecPaused = paused;
      btnRecPause.textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
    }).catch((error) => console.error('Error pausing native recording:', error));
    return;
  }
  if (!overlayState.mediaRecorder) return;
  if (overlayState.mediaRecorder.state === 'recording') {
    overlayState.mediaRecorder.pause();
    overlayState.isRecPaused = true;
    btnRecPause.textContent = '▶ Продолжить';
  } else if (overlayState.mediaRecorder.state === 'paused') {
    overlayState.mediaRecorder.resume();
    overlayState.isRecPaused = false;
    btnRecPause.textContent = '⏸ Пауза';
  }
}

async function stopVideoRecording() {
  if (overlayState.isNativeRecording) {
    clearInterval(overlayState.recTimerInterval);
    try {
      await window.aeroAPI.recordingStop();
      overlayState.isNativeRecording = false;
      overlayState.hasNativeRecording = true;
      recordingBar.classList.add('hidden');
      if (videoReviewBar) videoReviewBar.classList.remove('hidden');
      if (window.SoundSynth) window.SoundSynth.playVideoStop();
    } catch (error) {
      console.error('Error stopping native recording:', error);
    }
    return;
  }
  if (overlayState.mediaRecorder && overlayState.mediaRecorder.state !== 'inactive') {
    clearInterval(overlayState.recTimerInterval);
    overlayState.mediaRecorder.stop();
  }
}

function cancelRecording() {
  if (overlayState.isNativeRecording && window.aeroAPI.recordingCancel) {
    clearInterval(overlayState.recTimerInterval);
    overlayState.isNativeRecording = false;
    window.aeroAPI.recordingCancel().finally(closeOverlay);
    return;
  }
  overlayState.isCancelled = true;
  if (overlayState.mediaRecorder && overlayState.mediaRecorder.state !== 'inactive') {
    clearInterval(overlayState.recTimerInterval);
    overlayState.mediaRecorder.stop();
  }
  closeOverlay();
}

// Global hookup for IPC triggers
if (window.aeroAPI) {
  window.aeroAPI.onTriggerRecordVideo(() => {
    if (overlayState.isNativeRecording) {
      stopVideoRecording();
    } else if (!overlayState.mediaRecorder || overlayState.mediaRecorder.state === 'inactive') {
      startVideoRecording();
    } else {
      stopVideoRecording();
    }
  });

  window.aeroAPI.onTriggerPauseVideo(() => {
    togglePauseVideo();
  });
}

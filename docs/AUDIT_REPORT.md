# Полный технический аудит, верификация архитектуры и анализ стабильности AeroSnap 2.0

**Версия проекта:** 2.0.0  
**Дата аудита:** 2026-09-01  
**Статус проверки:** ЗАВЕРШЕНО  
**Целевая платформа:** Windows 10 / Windows 11 (x64)  
**Ревизия кодовой базы:** AeroSnap 2.1 (src/ & src-tauri/)  
**Ответственный аудитор:** Worker Subagent (Technical Audit Lead)

---

## Содержание

1. [Executive Summary & Архитектурный рейтинг надёжности](#1-executive-summary--архитектурный-рейтинг-надёжности)
2. [Архитектурный обзор и состояние стека (Dual-Stack Analysis)](#2-архитектурный-обзор-и-состояние-стека-dual-stack-analysis)
3. [Сводная матрица всех выявленных дефектов (Severity Matrix)](#3-сводная-матрица-всех-выявленных-дефектов-severity-matrix)
4. [Детальный анализ дефектов по категориям](#4-детальный-анализ-дефектов-по-категориям)
   - [4.1. 🔴 Критические дефекты (Critical / P0)](#41--критические-дефекты-critical--p0)
   - [4.2. 🟠 Потенциальные утечки, зависания и системные конфликты (High / P1)](#42--потенциальные-утечки-зависания-и-системные-конфликты-high--p1)
   - [4.3. 🟡 Производительность, память и оптимизация (Medium / P2)](#43--производительность-память-и-оптимизация-medium--p2)
   - [4.4. 🔵 UI/UX дефекты и функциональные улучшения (Low & Improvement / P3)](#44--uiux-дефекты-и-функциональные-улучшения-low--improvement--p3)
   - [4.5. 🔍 Дополнительные архитектурные скрытые дефекты и нюансы (GAP-01 — GAP-07)](#45--дополнительные-архитектурные-скрытые-дефекты-и-нюансы-gap-01--gap-07)
5. [Глубокие технические аудиты подсистем](#5-глубокие-технические-аудиты-подсистем)
   - [5.1. Полная матрица IPC-каналов и синхронизация рантаймов](#51-полная-матрица-ipc-каналов-и-синхронизация-рантаймов)
   - [5.2. Математика кадрирования: мультимониторность и High-DPI масштабирование](#52-математика-кадрирования-мультимониторность-и-high-dpi-масштабирование)
   - [5.3. Жизненный цикл MediaStream, захват экрана и кодирование видео/GIF](#53-жизненный-цикл-mediastream-захват-экрана-и-кодирование-видеоgif)
   - [5.4. Отказоустойчивость файловой системы, буфер обмена и обработка ошибок](#54-отказоустойчивость-файловой-системы-буфер-обмена-и-обработка-ошибок)
   - [5.5. Анализ зависимостей, чистоты сборки и уязвимостей npm](#55-анализ-зависимостей-чистоты-сборки-и-уязвимостей-npm)
6. [Пошаговый план устранения дефектов (Phased Remediation Plan)](#6-пошаговый-план-устранения-дефектов-phased-remediation-plan)
7. [Матрица верификации критериев приёмки (Acceptance Criteria)](#7-матрица-верификации-критериев-приёмки-acceptance-criteria)

---

## 1. Executive Summary & Архитектурный рейтинг надёжности

В рамках комплексного технического аудита AeroSnap 2.0 был проведён сплошной анализ всей кодовой базы проекта:
1. **Главный процесс и мосты Electron** (src/main/, src/preload/).
2. **Фронтенд рендерера и графические движки** (src/renderer/: overlay.js, settings.js, tauri-bridge.js, sound.js, CSS/HTML).
3. **Нативный бэкенд Tauri 2.0 на Rust** (src-tauri/src/: capture.rs, recording.rs, settings.rs, tray.rs, shortcuts.rs, lib.rs).
4. **Конфигурации сборки, манифесты и зависимости** (package.json, Cargo.toml, tauri.conf.json, npm audit).

### Ключевые выводы аудита:
- **Архитектурная зрелость Tauri 2.0 Backend**: Высокая. Переход на Rust позволил сократить размер дистрибутива со 100+ МБ (Electron portable) до 1.6 МБ (NSIS Tauri), обеспечил аппаратное кодирование MP4 через Windows Media Foundation (H.264), атомарную запись конфигураций и мгновенный фоновый запуск с 0% CPU.
- **Критический дефект High-DPI в Tauri (скриншоты и видео/GIF)**: В модулях `src-tauri/src/capture.rs` (`scale_factor: 1.0`, `crop_image`) и `src-tauri/src/recording.rs` (`clamp_rect`) выявлено отсутствие масштабирования логических координат из Webview. При нарезке физических буферов экрана из `xcap` и `windows-capture` координаты не умножаются на `scale_factor`, что приводит к 4-кратному смещению и обрезке как скриншотов, так и нативной видео/GIF записи на дисплеях с масштабированием 125–200% (BUG-04, GAP-01).
- **Критические дефекты в ветке Electron**: 
  - Полная неработоспособность кнопки «Сохранить» из-за отсутствия метода saveScreenshotAs в src/preload/index.js (BUG-01).
  - Затирание пользовательских настроек из-за несоответствия формата возвращаемого объекта ({ success: true, settings } vs settings) (BUG-02).
  - Генерация повреждённых/фальшивых файлов MP4 и GIF (сырой WebM-поток записывается с чужими расширениями) (BUG-03).
- **Системные риски для ОС Windows**: Регистрация глобального хука Escape на уровне всей ОС перехватывает клавишу во всех окнах Windows (BUG-06), а отсутствие обработчика before-quit блокирует перезагрузку и выключение ПК (BUG-07).
- **Скрытые архитектурные нюансы (Challenger Gaps GAP-01 — GAP-07)**: В ходе экспертного рецензирования дополнительно выявлены: искажение координат в `recording.rs:clamp_rect` (GAP-01), мёртвый вызов несуществующей команды `video_save` в `tauri-bridge.js` (GAP-02), утечка памяти `Blob URL` при сбоях оверлея (GAP-03), игнорирование флага звука `audioBeep` (GAP-04), отсутствие `create_dir_all` в `open_directory` (GAP-05), сбой разворачивания свернутого окна настроек `unminimize` (GAP-06) и преждевременное удаление записанного видео по Escape на панели предпросмотра (GAP-07).
- **Безопасность npm**: Выявлено 14 уязвимостей (13 High, 1 Critical) в devDependencies, привязанных к устаревшему тулчейну Electron.

### Индекс надёжности подсистем (Component Reliability Index)

| Подсистема / Компонент | Стек / Файлы | Оценка (0–100) | Статус надёжности | Ключевые риски |
|---|---|---|---|---|
| **Tauri Capture & Crop Engine** | Rust (capture.rs, xcap) | 65 / 100 | ⚠️ Требует правок | High-DPI обрезка, привязка к Primary Monitor |
| **Tauri Video & GIF Recording** | Rust (recording.rs, windows-capture) | 76 / 100 | ⚠️ Требует правок | High-DPI clamp_rect, удаление по Esc при review, таймстамп паузы |
| **Tauri Settings & Storage** | Rust (settings.rs, lib.rs) | 90 / 100 | 🟢 Отлично | open_directory без create_dir_all, unminimize окна, ложный тост |
| **Renderer Canvas & Annotations** | Vanilla JS (overlay.js) | 70 / 100 | ⚠️ Требует правок | Рассинхрон при ресайзе рамки, гонка текста, утечка Blob URL |
| **Audio Synth Engine** | Web Audio API (sound.js) | 98 / 100 | 🟢 Отлично | Чистый синтез без утечек ресурсов |
| **Electron Main & IPC Bridge** | Node.js (src/main/, src/preload/) | 40 / 100 | 🔴 Нестабильно | Отсутствие saveScreenshotAs, вайп настроек, фейк MP4 |
| **Global Shortcuts & Tray** | Electron / Tauri (shortcuts, tray) | 60 / 100 | ⚠️ Требует правок | Глобальный перехват Escape, клик/даблклик в трее |
| **Build & Dependencies** | npm / Cargo (package.json, Cargo.toml) | 72 / 100 | ⚠️ Требует очистки | 14 npm CVEs, дублирующая папка гитхаб/ (1.6 МБ) |

**Итоговый совокупный Architecture Health Score:** **71.4 / 100**

---

## 2. Архитектурный обзор и состояние стека (Dual-Stack Analysis)

Проект AeroSnap 2.0 находится в состоянии архитектурной миграции между двумя поколениями бэкенда при едином фронтенде:

`
                      ┌────────────────────────────────────────┐
                      │          UI / RENDERER LAYER           │
                      │  (Vanilla JS, HTML5, Frutiger Aero CSS) │
                      │  overlay.js, settings.js, sound.js     │
                      └───────────────────┬────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
     ┌───────────────────────────┐                 ┌───────────────────────────┐
     │   LEGACY ELECTRON STACK   │                 │     TARGET TAURI 2.0      │
     │  (Node.js 24 + Chromium)  │                 │    (Rust Native Engine)   │
     ├───────────────────────────┤                 ├───────────────────────────┤
     │ • Main: src/main/index.js │                 │ • Core: src-tauri/lib.rs  │
     │ • Preload: preload/index.js│                │ • Bridge: tauri-bridge.js │
     │ • Screen: desktopCapturer │                 │ • Screen: xcap / WGC      │
     │ • Video: MediaRecorder    │                 │ • Video: windows-capture  │
     │ • Config: store.js        │                 │ • Config: settings.rs     │
     │ • Size: 100+ MB (Portable)│                 │ • Size: 1.6 MB (NSIS)     │
     │ • Vulnerabilities: 14 CVEs│                 │ • Vulnerabilities: 0 CVEs │
     └───────────────────────────┘                 └───────────────────────────┘
`

### Архитектурные расхождения и точки разрыва:
1. **Фронтенд уже мигрировал на интерфейсы Tauri**: src/renderer/overlay.js вызывает window.aeroAPI.saveScreenshotAs(), ecordingStart(), ecordingStop(), ecordingExport().
2. **Preload Electron устарел**: src/preload/index.js не содержит saveScreenshotAs, ecordingStart, ecordingStop, ecordingExport, overlayReady. При запуске через 
pm start (Electron) функционал сохранения падает.
3. **Конфигурация репозитория**: package.json по умолчанию содержит скрипты для запуска и сборки устаревшего Electron (
pm start -> lectron ., 
pm run build -> lectron-builder), хотя целевой релизный бинарник elease/AeroSnap-2.0-windows-x64-setup.exe собран на базе Tauri 2.0.

---

## 3. Сводная матрица всех выявленных дефектов (Severity Matrix)

| ID | Категория | Краткое описание дефекта | Файлы и строки кода | Приоритет / Severity | Влияние на систему |
|---|---|---|---|---|---|
| **BUG-01** | IPC / Save | Отсутствие метода saveScreenshotAs в preload Electron | src/renderer/overlay.js:1262<br>src/preload/index.js:17-22<br>src/main/index.js:363 | 🔴 **Critical** | Невозможно сохранить скриншот по кнопке «Сохранить» в Electron |
| **BUG-02** | Config / Data | Затирание настроек в Electron из-за оборачивания в { success, settings } | src/main/store.js:80<br>src/renderer/settings.js:113 | 🔴 **Critical** | Полный сброс всех путей и настроек на пустые значения при сохранении |
| **BUG-03** | Video / Export | Фальшивая запись MP4 и GIF в Electron (сырой WebM без транскодирования) | src/renderer/overlay.js:1401-1448<br>src/main/index.js:389-413 | 🔴 **Critical** | Невоспроизводимые и поврежденные видео/GIF файлы |
| **BUG-04** | Capture & Rec / DPI | Поломка кадрирования High-DPI в Tauri (скриншоты и видео/GIF: scale_factor: 1.0, crop_image, clamp_rect) | src-tauri/src/capture.rs:54, 104-116<br>src-tauri/src/recording.rs:325-340<br>src/renderer/overlay.js:141 | 🔴 **Critical** | Скриншот и видеозапись содержат только 1/4 часть экрана на экранах 200% DPI |
| **BUG-05** | Video / Lifecycle | Аварийный обрыв записи и гонка уничтожения окна в closeOverlay() | src/renderer/overlay.js:1291-1308<br>src/main/index.js:180-186 | 🟠 **High** | Потеря видеозаписи и утечка медиа-треков захвата экрана |
| **BUG-06** | Shortcuts / OS | Глобальный перехват клавиши Escape во всей операционной системе | src/main/shortcuts.js:82-96<br>src/main/index.js:163, 181 | 🟠 **High** | Блокировка клавиши Escape в других программах Windows |
| **BUG-07** | Lifecycle / OS | Блокировка выключения и перезагрузки Windows окном настроек | src/main/index.js:106-111 | 🟠 **High** | Приложение зависает в фоне и препятствует выключению ПК |
| **BUG-08** | Multi-Monitor | Отсутствие поддержки нескольких мониторов и отрицательных координат | src/main/index.js:129-137, 328<br>src-tauri/src/capture.rs:43-48 | 🟠 **High** | Невозможность сделать снимок на втором/третьем мониторе |
| **BUG-09** | Security / npm | 14 уязвимостей безопасности в devDependencies Electron (1 Critical, 13 High) | package.json:25-29<br>package-lock.json | 🟠 **High** | Уязвимости произвольной записи файлов (tar) и bypass ASAR |
| **BUG-10** | Error Handling | Безмолвное проглатывание ошибок экспорта видео/GIF в оверлее | src/renderer/overlay.js:1505-1512 | 🟠 **High** | Пользователь не знает о сбое записи при переполнении диска |
| **BUG-11** | Annotations | Рассинхронизация аннотаций при перемещении и ресайзе рамки | src/renderer/overlay.js:585-592, 1201-1237 | 🟠 **High** | Нарисованные элементы «уплывают» за пределы рамки при сохранении |
| **BUG-12** | Video / Perf | Одновременное двойное кодирование MP4 и GIF на каждый кадр в Tauri | src-tauri/src/recording.rs:85-111, 143-165 | 🟡 **Medium** | Высокая нагрузка на CPU (CPU spike) при записи 4K 60fps |
| **BUG-13** | Video / Timing | Скачок таймлайна при паузе видеозаписи в Tauri | src-tauri/src/recording.rs:119-121, 134, 171 | 🟡 **Medium** | Временной пропуск кадров и рассинхронизация времени в MP4 |
| **BUG-14** | Undo-Redo | Утечка Redo-стека при клике вне выделения и отсутствие Undo в Clear All | src/renderer/overlay.js:574-577, 839-846 | 🟡 **Medium** | Восстановление старых рисунков на новом выделении, потеря данных |
| **BUG-15** | Memory / Canvas | Пересоздание размеров холстов и неоптимизированный буфер размытия | src/renderer/overlay.js:617-621, 901-904 | 🟡 **Medium** | Микрофризы и сброс GPU-контекста во время рисования блюра |
| **BUG-16** | Storage / UX | Ложный тост об ошибке сохранения при сбое запуска Проводника в Tauri | src-tauri/src/lib.rs:235-239 | 🟡 **Medium** | Сообщение об ошибке при фактически успешном сохранении файла |
| **BUG-17** | Memory / Preload | Накопление слушателей ipcRenderer.on без функций отписки (disposers) | src/preload/index.js:28-39 | 🟡 **Medium** | Утечка памяти при перезагрузке окна рендера |
| **BUG-18** | Cleanliness | Избыточная папка гитхаб/ с кириллическим именем (1.6 МБ дубликатов) | гитхаб/* | 🟡 **Medium** | Мусорные релизные бинарники и дублирующая документация |
| **BUG-19** | Annotations / UX | Гонка коммита активного текстового редактора при быстром клике «Сохранить» | src/renderer/overlay.js:1112-1115, 1239-1274 | 🔵 **Low** | Текст не попадает на скриншот при быстром сохранении |
| **BUG-20** | Settings / Stub | Фиктивная настройка dualMouseClick без нативного хука мыши | src/main/store.js:17<br>src/renderer/settings.js:68, 100<br>src-tauri/src/settings.rs:22 | 🔵 **Low** | Неработающий чекбокс в интерфейсе настроек |
| **BUG-21** | Shortcuts / UI | Отсутствие обратной связи при конфликте глобальных хоткеев в Electron | src/main/shortcuts.js:18-37 | 🔵 **Low** | Пользователь не знает, что хоткей занят другой программой |
| **BUG-22** | Autostart | Невалидный путь автозапуска в Portable-сборке Electron (process.execPath) | src/main/index.js:58-71 | 🔵 **Low** | Сброс автозагрузки после перезагрузки Windows в portable |
| **BUG-23** | Tray / UX | Гонка клика и даблклика в системном трее Windows Electron | src/main/tray.js:48-64 | 🔵 **Low** | Одновременное открытие оверлея и окна настроек |
| **BUG-24** | Storage / Error | Unhandled Promise Rejection при открытии несуществующей папки в Settings | src/renderer/settings.js:211-215<br>src-tauri/src/lib.rs:84-88 | 🔵 **Low** | Необработанная ошибка промиса в консоли |
| **BUG-25** | Config / Name | Устаревшее имя файла конфигурации aerosnap-v1.5-config.json в коде Tauri | src-tauri/src/settings.rs:114 | 🔵 **Low** | Несоответствие версии 2.0 в имени конфигурационного файла |
| **BUG-26** | Tools | Отсутствие инструментов аннотаций «Маркер / Хайлайтер» и «Эллипс» | src/renderer/overlay.html:31-53<br>src/renderer/overlay.js:87 | ⚪ **Improvement** | Недостаток базовых инструментов разметки |
| **BUG-27** | Docs | Устаревшая архитектурная документация в docs/DECISIONS.md | docs/DECISIONS.md:1-58 | ⚪ **Improvement** | Документ описывает Electron вместо актуального Tauri 2.0 |

### Сводная матрица дополнительных скрытых дефектов (Challenger Gaps GAP-01 — GAP-07)

| ID | Категория | Краткое описание дефекта | Файлы и строки кода | Приоритет / Severity | Влияние на систему |
|---|---|---|---|---|---|
| **GAP-01** | Video / DPI | Немасштабированные координаты в `recording.rs:clamp_rect` при записи видео/GIF | src-tauri/src/recording.rs:325-340 | 🔴 **Critical** | Видео и GIF захватывают только верхний левый угол на High-DPI мониторах |
| **GAP-02** | IPC / Ghost Bridge | Мёртвый мост `saveVideo`, вызывающий незарегистрированную команду `video_save` | src/renderer/tauri-bridge.js:44-47<br>src-tauri/src/lib.rs:476-496 | 🟠 **High** | Ошибка `"command video_save not found"` при обращении к мосту в Tauri |
| **GAP-03** | Memory / Leak | Утечка `Blob URL` (`URL.createObjectURL`) при ошибке загрузки фона или закрытии | src/renderer/overlay.js:152, 157-159<br>src/renderer/tauri-bridge.js:23 | 🟠 **High** | Накопление неосвобожденных графических буферов в памяти Webview |
| **GAP-04** | Audio / Settings | Игнорирование настройки `audioBeep` при воспроизведении сигналов старта/стопа видео | src/renderer/overlay.js:1496, 1553<br>src-tauri/src/settings.rs:34 | 🟡 **Medium** | Звуковые сигналы проигрываются даже если они отключены в настройках |
| **GAP-05** | Storage / IO | Сбой `open_directory` из-за отсутствия предварительного создания каталога | src-tauri/src/lib.rs:84-88 | 🟡 **Medium** | Ошибка при открытии ещё не созданной папки сохранения из окна настроек |
| **GAP-06** | Window / UX | Невозможность восстановить свернутое в трей/панель окно настроек (`unminimize`) | src-tauri/src/lib.rs:319-322 | 🔵 **Low** | Клик в трее не разворачивает свернутое окно настроек на передний план |
| **GAP-07** | Video / Safety | Безвозвратное удаление готовой видеозаписи при нажатии Escape на панели ревью | src-tauri/src/lib.rs:107-117<br>src-tauri/src/recording.rs:284, 318-322 | 🟠 **High** | Нажатие Esc в режиме предпросмотра стирает временный MP4/GIF без подтверждения |

---

## 4. Детальный анализ дефектов по категориям

### 4.1. 🔴 Критические дефекты (Critical / P0)

#### 4.1.1. [BUG-01] Отсутствие метода `saveScreenshotAs` в preload Electron
- **Затронутые файлы и строки:**
  - `src/renderer/overlay.js`: строки 1254–1274
  - `src/preload/index.js`: строки 17–22
  - `src/main/index.js`: строки 362–386
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/overlay.js:1262-1266
  if (!window.aeroAPI || !window.aeroAPI.saveScreenshotAs) {
    throw new Error('Системный диалог сохранения недоступен');
  }
  const result = await window.aeroAPI.saveScreenshotAs(finalDataUrl);
  if (result) closeOverlay();
  ```
  ```javascript
  // src/preload/index.js:18-21
  grabScreenRect: (rect) => ipcRenderer.invoke('capture:grab-screen-rect', rect),
  copyScreenshot: (dataUrl) => ipcRenderer.invoke('capture:copy-screenshot', dataUrl),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('capture:save-screenshot', dataUrl),
  getDesktopSources: () => ipcRenderer.invoke('capture:get-sources'),
  ```
- **Первопричина (Root Cause):** При обновлении интерфейса оверлея под Tauri 2.0 функция сохранения была переведена на вызов диалога `saveScreenshotAs`. В файле `src/preload/index.js` мост не был обновлён (присутствует только `saveScreenshot`), а в `src/main/index.js` отсутствует обработчик вызова `dialog.showSaveDialog`.
- **Влияние на систему (Impact):** При запуске приложения в среде Electron нажатие кнопки «Сохранить» или шортката Ctrl+S всегда завершается ошибкой `Error: Системный диалог сохранения недоступен`, делая базовый функционал создания скриншотов неработоспособным.
- **План исправления (Remediation):**
  1. В `src/preload/index.js` добавить метод:
     ```javascript
     saveScreenshotAs: (dataUrl) => ipcRenderer.invoke('capture:save-screenshot-as', dataUrl),
     ```
  2. В `src/main/index.js` зарегистрировать IPC-обработчик с открытием системного окна сохранения:
     ```javascript
     ipcMain.handle('capture:save-screenshot-as', async (_, dataUrl) => {
       const settings = store.getSettings();
       const defaultDir = settings.screenshots?.savePath || app.getPath('pictures');
       const ext = settings.screenshots?.format === 'jpg' ? 'jpg' : 'png';
       const defaultName = this.generateAutoFileName(defaultDir, ext).fileName;
       const { canceled, filePath } = await dialog.showSaveDialog(this.overlayWindow, {
         defaultPath: path.join(defaultDir, defaultName),
         filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
       });
       if (canceled || !filePath) return null;
       const image = nativeImage.createFromDataURL(dataUrl);
       const buffer = filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ? image.toJPEG(95) : image.toPNG();
       fs.writeFileSync(filePath, buffer);
       if (settings.screenshots?.autoClipboard !== false) clipboard.writeImage(image);
       shell.showItemInFolder(filePath);
       return { success: true, filePath };
     });
     ```
  3. В `src/renderer/overlay.js` предусмотреть fallback: если `saveScreenshotAs` отсутствует, вызывать `saveScreenshot(finalDataUrl)`.

---

#### 4.1.2. [BUG-02] Затирание пользовательских настроек в Electron
- **Затронутые файлы и строки:**
  - `src/main/store.js`: строки 76–85
  - `src/main/index.js`: строки 247–253
  - `src/renderer/settings.js`: строки 83–122
- **Фрагмент исходного кода:**
  ```javascript
  // src/main/store.js:76-85
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
  ```
  ```javascript
  // src/renderer/settings.js:111-115
  if (window.aeroAPI) {
    try {
      currentSettings = await window.aeroAPI.saveSettings(currentSettings);
      renderSettings();
      showToast('Настройки сохранены');
    } catch (error) { ... }
  }
  ```
- **Первопричина (Root Cause):** В Tauri бэкенд возвращает чистый объект `Settings`, а в Electron `store.js` возвращает структуру `{ success: true, settings: {...} }`. В `settings.js:113` переменной `currentSettings` присваивается эта обёртка. При последующем вызове `renderSettings()` свойства `currentSettings.general`, `currentSettings.screenshots` и `currentSettings.video` оказываются `undefined`, из-за чего все поля ввода на форме мгновенно очищаются (`value = ''`). При любом следующем изменении любого чекбокса функция `persistSettings()` считывает эти пустые поля и перезаписывает `aerosnap-config.json` пустыми строками.
- **Влияние на систему (Impact):** Необратимая потеря пользовательских путей сохранения, горячих клавиш и настроек при первом же изменении конфигурации в интерфейсе Electron.
- **План исправления (Remediation):**
  1. В `src/main/index.js` возвращать `store.saveSettings(newSettings).settings || store.getSettings()`.
  2. В `src/renderer/settings.js:113` добавить безопасное разворачивание:
     ```javascript
     const response = await window.aeroAPI.saveSettings(currentSettings);
     currentSettings = response && response.settings ? response.settings : (response || currentSettings);
     ```

---

#### 4.1.3. [BUG-03] Фальшивая запись MP4 и GIF в Electron (WebM без конвертации)
- **Затронутые файлы и строки:**
  - `src/renderer/overlay.js`: строки 1401–1408, 1446–1448
  - `src/main/index.js`: строки 389–413
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/overlay.js:1401-1407
  let mimeType = 'video/webm';
  if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
    mimeType = 'video/webm; codecs=vp9';
  } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
    mimeType = 'video/webm; codecs=vp8';
  }
  const mediaRecorder = new MediaRecorder(croppedStream, { mimeType });
  ```
  ```javascript
  // src/main/index.js:393-398
  const ext = format === 'gif' ? 'gif' : 'mp4';
  const { fileName, filePath } = this.generateAutoFileName(saveDir, ext);
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(filePath, buffer);
  ```
- **Первопричина (Root Cause):** Chromium `MediaRecorder` в рендерере генерирует поток исключительно в формате WebM (`video/webm; codecs=vp9/vp8`). В главном процессе Electron полученный бинарный буфер WebM напрямую сохраняется в файл с расширением `.mp4` или `.gif` без транскодирования или конвертации кадров.
- **Влияние на систему (Impact):** 
  - Файлы с расширением `.gif` на самом деле являются WebM-видео. Они не отображаются стандартными просмотрщиками изображений Windows, браузерами через `<img>` и мессенджерами.
  - Файлы с расширением `.mp4` на самом деле содержат VP9 WebM контейнер. Windows Media Player, QuickTime и большинство мобильных устройств выдают ошибку воспроизведения.
- **План исправления (Remediation):**
  - Для GIF: Внедрить сборку кадров из Canvas и кодирование через Web Worker с библиотекой `gifshot` или `omggif`.
  - Для MP4: В главном процессе подключить нативный транскодер (например, `@ffmpeg-installer/ffmpeg` + `fluent-ffmpeg`) для быстрой упаковки WebM в H.264 MP4, либо полностью перейти на нативный модуль Tauri (`windows-capture`), где аппаратный энкодер H.264 уже реализован.

---

#### 4.1.4. [BUG-04] Поломка кадрирования High-DPI в Tauri скриншотах и нативной видео/GIF записи
- **Затронутые файлы и строки:**
  - `src-tauri/src/capture.rs`: строки 50–57, 104–116
  - `src-tauri/src/recording.rs`: строки 325–340 (`clamp_rect`)
  - `src/renderer/overlay.js`: строки 141, 1183–1204
- **Фрагмент исходного кода:**
  ```rust
  // src-tauri/src/capture.rs:50-56
  let (width, height) = image.dimensions();
  let init = OverlayInit {
      mode: mode.to_string(),
      display_width: width,
      display_height: height,
      scale_factor: 1.0, // <-- ОШИБКА: Жестко зашит масштаб 1.0!
      background_data_url: String::new(),
      settings,
  };
  ```
  ```rust
  // src-tauri/src/capture.rs:104-110
  fn crop_image(source: &RgbaImage, rect: CaptureRect) -> RgbaImage {
      let max_w = source.width();
      let max_h = source.height();
      let x = rect.x.max(0.0).round() as u32;
      let y = rect.y.max(0.0).round() as u32;
      let width = rect.w.max(1.0).round() as u32;
      let height = rect.h.max(1.0).round() as u32;
      ...
  ```
  ```rust
  // src-tauri/src/recording.rs:325-340
  fn clamp_rect(rect: CaptureRect, monitor_width: u32, monitor_height: u32) -> PixelRect {
      let x = rect.x.max(0.0).round() as u32; // <-- ОШИБКА: Координаты из Webview не масштабируются!
      let y = rect.y.max(0.0).round() as u32;
      let x = x.min(monitor_width.saturating_sub(2));
      let y = y.min(monitor_height.saturating_sub(2));
      let mut width = (rect.w.max(2.0).round() as u32).min(monitor_width - x);
      let mut height = (rect.h.max(2.0).round() as u32).min(monitor_height - y);
      width -= width % 2;
      height -= height % 2;
      PixelRect {
          x,
          y,
          width: width.max(2),
          height: height.max(2),
      }
  }
  ```
- **Первопричина (Root Cause):**
  1. Библиотека `xcap` и модуль `windows-capture` захватывают кадры экрана в реальных физических пикселях (например, 3840x2160 при разрешении 4K с масштабом Windows 200%).
  2. Окно Webview оверлея работает в логических координатах (1920x1080).
  3. В `capture.rs:54` масштаб жестко передается как `scale_factor: 1.0`. В `overlay.js:141` переменная `overlayState.scaleFactor` получает значение `1.0`, игнорируя реальный `window.devicePixelRatio = 2.0`.
  4. При выделении области пользователем координаты `CaptureRect (x, y, w, h)` отправляются в Rust в логических пикселях.
  5. В `capture.rs:crop_image` логические координаты напрямую преобразуются в `u32` и обрезают физический буфер 3840x2160 без умножения на `scale_factor`.
  6. В `recording.rs:clamp_rect` логический прямоугольник `CaptureRect` аналогично преобразуется в `PixelRect` без умножения на `scale_factor`, после чего передаётся в `windows-capture` (`frame.buffer_crop`).
- **Влияние на систему (Impact):**
  - **Скриншоты:** На экранах с масштабированием Windows 125%, 150%, 175%, 200% итоговый скриншот содержит только верхнюю левую четверть выделенной области, координаты смещены.
  - **Видео и GIF запись:** Нативная запись MP4 и GIF в Tauri страдает от аналогичного критического искажения — на High-DPI мониторах записывается лишь уменьшенный фрагмент из левого верхнего угла выделенной рамки вместо выбранной пользователем зоны экрана.
- **План исправления (Remediation):**
  1. В `src-tauri/src/capture.rs` считывать реальный масштаб монитора:
     ```rust
     let scale_factor = monitor.scale_factor().unwrap_or(1.0) as f64;
     let init = OverlayInit {
         mode: mode.to_string(),
         display_width: width,
         display_height: height,
         scale_factor,
         background_data_url: String::new(),
         settings,
     };
     ```
  2. В `capture.rs:crop_image` масштабировать координаты на `scale_factor`:
     ```rust
     fn crop_image(source: &RgbaImage, rect: CaptureRect, scale: f64) -> RgbaImage {
         let max_w = source.width();
         let max_h = source.height();
         let x = (rect.x * scale).max(0.0).round() as u32;
         let y = (rect.y * scale).max(0.0).round() as u32;
         let width = (rect.w * scale).max(1.0).round() as u32;
         let height = (rect.h * scale).max(1.0).round() as u32;
         let x = x.min(max_w.saturating_sub(1));
         let y = y.min(max_h.saturating_sub(1));
         let width = width.min(max_w.saturating_sub(x)).max(1);
         let height = height.min(max_h.saturating_sub(y)).max(1);
         image::imageops::crop_imm(source, x, y, width, height).to_image()
     }
     ```
  3. В `src-tauri/src/recording.rs` адаптировать `clamp_rect` с учётом `scale_factor`:
     ```rust
     fn clamp_rect(rect: CaptureRect, monitor_width: u32, monitor_height: u32, scale: f64) -> PixelRect {
         let x = (rect.x * scale).max(0.0).round() as u32;
         let y = (rect.y * scale).max(0.0).round() as u32;
         let x = x.min(monitor_width.saturating_sub(2));
         let y = y.min(monitor_height.saturating_sub(2));
         let mut width = ((rect.w * scale).max(2.0).round() as u32).min(monitor_width - x);
         let mut height = ((rect.h * scale).max(2.0).round() as u32).min(monitor_height - y);
         width -= width % 2;
         height -= height % 2;
         PixelRect {
             x,
             y,
             width: width.max(2),
             height: height.max(2),
         }
     }
     ```
  4. В `src-tauri/src/lib.rs` в команде `recording_start` определять `scale_factor` активного монитора и передавать его в `recording.start()`.

---

### 4.2. 🟠 Потенциальные утечки, зависания и системные конфликты (High / P1)

#### 4.2.1. [BUG-05] Асинхронный обрыв видеозаписи и гонка уничтожения окна в `closeOverlay()`
- **Затронутые файлы и строки:**
  - `src/renderer/overlay.js`: строки 1291–1308, 1433–1460, 1544–1578
  - `src/main/index.js`: строки 180–186
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/overlay.js:1291-1297
  function closeOverlay() {
    if (overlayState.mediaRecorder && overlayState.mediaRecorder.state !== 'inactive') {
      stopVideoRecording();
    }
    if (window.aeroAPI) {
      Promise.resolve(window.aeroAPI.closeOverlay()).finally(() => { ... });
    }
  }
  ```
  ```javascript
  // src/main/index.js:180-186
  closeOverlay() {
    this.shortcutManager.unregisterOverlayEscape();
    if (this.overlayWindow) {
      this.overlayWindow.destroy();
      this.overlayWindow = null;
    }
  }
  ```
- **Первопричина (Root Cause):** Метод `stopVideoRecording()` инициирует асинхронную остановку `mediaRecorder.stop()`, завершение которой и сборка чанков происходят в обработчике `mediaRecorder.onstop`. Однако `window.aeroAPI.closeOverlay()` вызывается синхронно сразу следом. Главный процесс Electron немедленно уничтожает окно (`this.overlayWindow.destroy()`), убивая процесс рендерера до того, как `onstop` успеет финализировать и сохранить данные. В Tauri, если оверлей скрывается без явной остановки треков стрима, `overlayState.stream` продолжает удерживать захват экрана в фоновом режиме.
- **Влияние на систему (Impact):** Потеря записанного видеопотока при закрытии оверлея по Esc, утечка видеопотоков в памяти и незакрытый захват экрана Windows.
- **План исправления (Remediation):**
  1. В `closeOverlay()` проверять состояние записи и дожидаться полного завершения промиса остановки:
     ```javascript
     async function closeOverlaySafe() {
       if (overlayState.isNativeRecording) {
         try { await window.aeroAPI.recordingStop(); } catch (e) {}
       }
       if (overlayState.mediaRecorder && overlayState.mediaRecorder.state !== 'inactive') {
         await new Promise(resolve => {
           overlayState.mediaRecorder.onstop = resolve;
           overlayState.mediaRecorder.stop();
         });
       }
       if (overlayState.stream) {
         overlayState.stream.getTracks().forEach(t => t.stop());
         overlayState.stream = null;
       }
       if (overlayState.videoElem) {
         overlayState.videoElem.pause();
         overlayState.videoElem.srcObject = null;
       }
       if (window.aeroAPI) {
         await window.aeroAPI.closeOverlay();
       }
     }
     ```

---

#### 4.2.2. [BUG-06] Глобальный перехват клавиши `Escape` во всей операционной системе
- **Затронутые файлы и строки:**
  - `src/main/shortcuts.js`: строки 82–96
  - `src/main/index.js`: строки 163, 181
- **Фрагмент исходного кода:**
  ```javascript
  // src/main/shortcuts.js:82-90
  registerOverlayEscape() {
    try {
      this.safeRegister('Escape', () => {
        if (this.appManager.overlayWindow) {
          this.appManager.closeOverlay();
        }
      });
    } catch (e) {}
  }
  ```
- **Первопричина (Root Cause):** Использование `globalShortcut.register('Escape')` устанавливает низкоуровневый системный хук Windows. В результате, пока открыто окно оверлея, любое нажатие клавиши `Escape` в любом другом приложении (браузере, IDE, проводнике, полноэкранных играх) перехватывается процессом AeroSnap. Если процесс оверлея зависнет или окно потеряет фокус, глобальный хук не снимается, блокируя клавишу во всей операционной системе.
- **Влияние на систему (Impact):** Нарушение работы интерфейса Windows и всех сторонних запущенных приложений.
- **План исправления (Remediation):**
  - Полностью удалить методы `registerOverlayEscape` и `unregisterOverlayEscape` из `src/main/shortcuts.js`.
  - В окне оверлея обработка клавиши `Escape` уже корректно реализована локально через `window.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); })` (`src/renderer/overlay.js:198`). Локального DOM-события окна с фокусом абсолютно достаточно.

---

#### 4.2.3. [BUG-07] Блокировка выключения и перезагрузки Windows окном настроек
- **Затронутые файлы и строки:**
  - `src/main/index.js`: строки 48–56, 106–111
- **Фрагмент исходного кода:**
  ```javascript
  // src/main/index.js:106-111
  this.settingsWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      this.settingsWindow.hide();
    }
  });
  ```
- **Первопричина (Root Cause):** Флаг `app.isQuitting` проставляется исключительно вручную при выборе пункта меню в системном трее «Закрыть AeroSnap» (`tray.js:110`). Когда операционная система Windows отправляет сигнал завершения сеанса (`WM_QUERYENDSESSION` / `WM_ENDSESSION`), перезагрузки ПК или вызова `app.quit()`, событие `close` отменяется через `e.preventDefault()`, потому что `app.isQuitting` равен `undefined`/`false`.
- **Влияние на систему (Impact):** Приложение зависает в фоновых процессах Windows и блокирует штатное выключение, выход из учетной записи и перезагрузку операционной системы.
- **План исправления (Remediation):**
  В `src/main/index.js` в методе `AppManager.init()` добавить глобальный обработчик `before-quit`:
  ```javascript
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
  ```

---

#### 4.2.4. [BUG-08] Отсутствие поддержки нескольких мониторов и отрицательных координат
- **Затронутые файлы и строки:**
  - `src/main/index.js`: строки 129–137, 309–331
  - `src-tauri/src/capture.rs`: строки 43–48
- **Фрагмент исходного кода:**
  ```javascript
  // src/main/index.js:129-136
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;
  const scaleFactor = primaryDisplay.scaleFactor || 1;

  this.overlayWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: width,
    height: height,
    ...
  ```
  ```rust
  // src-tauri/src/capture.rs:43-47
  let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
  let monitor = monitors
      .into_iter()
      .find(|m| m.is_primary().unwrap_or(false))
      .ok_or_else(|| "Primary monitor was not found".to_string())?;
  let image = monitor.capture_image().map_err(|e| e.to_string())?;
  ```
- **Первопричина (Root Cause):** В мультимониторных системах мониторы, расположенные слева от основного или выше него, имеют отрицательные экранные координаты (`x < 0`, `y < 0`). Приложение жестко открывает оверлей и выполняет захват только для `primaryDisplay` / `is_primary()`. Функция `desktopCapturer.getSources` в Electron берет `sources[0]`, не сверяя ID целевого дисплея.
- **Влияние на систему (Impact):** Пользователь не может сделать снимок или записать видео на втором/третьем мониторе. Если курсор находится на дополнительном экране, оверлей ошибочно открывается на основном экране.
- **План исправления (Remediation):**
  - При вызове горячей клавиши определять экран под курсором мыши:
    `const targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());`
  - Позиционировать окно оверлея по координатам `targetDisplay.bounds.x, targetDisplay.bounds.y, targetDisplay.bounds.width, targetDisplay.bounds.height`.
  - В Tauri опрашивать `xcap::Monitor` по положению курсора курсора Windows API (`GetCursorPos`).

---

#### 4.2.5. [BUG-09] 14 уязвимостей безопасности в devDependencies Electron
- **Затронутые файлы и строки:**
  - `package.json`: строки 25–29
  - `package-lock.json`
- **Результаты аудита `npm audit`:**
  - **1 Critical:** `tar` <=7.5.20 (GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx) — произвольная перезапись файлов через жесткие ссылки и обход путей.
  - **13 High:** `electron` <=40.10.2 (34 CVEs: ASAR integrity bypass, context isolation bypass, use-after-free), `builder-util-runtime` <9.7.0 (утечка авторизационных заголовков при редиректах), `extract-zip` (обход путей).
- **Первопричина (Root Cause):** Наличие устаревших пакетов `electron` (v34.2.0) и `electron-builder` (v25.1.8) в `devDependencies`, которые больше не требуются для релизной сборки на базе Tauri 2.0.
- **Влияние на систему (Impact):** Риски безопасности цепочки поставок (Supply Chain Risks) при сборке проекта.
- **План исправления (Remediation):**
  Удалить `electron` и `electron-builder` из `package.json` и `node_modules`, переведя проект на чистый тулчейн `@tauri-apps/cli`.

---

#### 4.2.6. [BUG-10] Безмолвное проглатывание ошибок экспорта видео/GIF в оверлее
- **Затронутые файлы и строки:**
  - `src/renderer/overlay.js`: строки 1505–1512
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/overlay.js:1505-1512
  async function exportNativeRecording(format, copyPath) {
    try {
      await window.aeroAPI.recordingExport(format, copyPath);
      closeOverlay();
    } catch (error) {
      console.error('Error exporting native recording:', error);
      // ОШИБКА: showOverlayMessage не вызывается!
    }
  }
  ```
- **Первопричина (Root Cause):** При возникновении ошибки записи на диск (диск переполнен, папка защищена от записи, диск отключен) блок `catch` выполняет только `console.error`.
- **Влияние на систему (Impact):** Окно оверлея просто зависает в режиме предпросмотра, кнопка экспорта перестает реагировать, а пользователь не получает никакой информации о причине сбоя.
- **План исправления (Remediation):**
  Добавить вызов `showOverlayMessage`:
  ```javascript
  async function exportNativeRecording(format, copyPath) {
    try {
      await window.aeroAPI.recordingExport(format, copyPath);
      closeOverlay();
    } catch (error) {
      console.error('Error exporting native recording:', error);
      showOverlayMessage(`Не удалось экспортировать запись: ${error}`, true);
    }
  }
  ```

---

#### 4.2.7. [BUG-11] Рассинхронизация аннотаций при перемещении и масштабировании рамки
- **Затронутые файлы и строки:**
  - `src/renderer/overlay.js`: строки 585–592, 606–612, 1201–1237
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/overlay.js:585-590
  if (overlayState.isMoving && overlayState.selection) {
    const newX = Math.max(0, Math.min(window.innerWidth - overlayState.selection.w, x - overlayState.moveOffsetX));
    const newY = Math.max(0, Math.min(window.innerHeight - overlayState.selection.h, y - overlayState.moveOffsetY));
    overlayState.selection.x = newX;
    overlayState.selection.y = newY;
    updateSelectionBox();
    return;
  }
  ```
- **Первопричина (Root Cause):** Координаты нарисованных фигур (стрелок, карандаша, размытия, текста) сохраняются в массиве `overlayState.history` в абсолютных экранных пикселях `(x, y)`. При перемещении рамки за пунктирный край или изменении размера за маркеры (`handleResize`) массив истории не обновляется. При нажатии «Сохранить» метод `createMergedScreenshot` производит кадрирование строго по новым координатам рамки `overlayState.selection`.
- **Влияние на систему (Impact):** Нарисованные аннотации остаются на старых местах экрана и оказываются смещенными либо полностью обрезанными на итоговом изображении.
- **План исправления (Remediation):**
  При перемещении рамки на вектор `(dx, dy)` применять соответствующее смещение ко всем элементам `overlayState.history`:
  ```javascript
  function moveAnnotations(dx, dy) {
    overlayState.history.forEach(item => {
      if (item.x !== undefined) item.x += dx;
      if (item.y !== undefined) item.y += dy;
      if (item.startX !== undefined) item.startX += dx;
      if (item.startY !== undefined) item.startY += dy;
      if (item.endX !== undefined) item.endX += dx;
      if (item.endY !== undefined) item.endY += dy;
      if (Array.isArray(item.points)) {
        item.points.forEach(p => { p.x += dx; p.y += dy; });
      }
    });
    redrawAnnotations();
  }
  ```

---

### 4.3. 🟡 Производительность, память и оптимизация (Medium / P2)

#### 4.3.1. [BUG-12] Одновременное двойное кодирование MP4 и GIF в Tauri
- **Затронутые файлы и строки:** `src-tauri/src/recording.rs`: строки 85–111, 143–165
- **Первопричина:** На каждый вызов старта записи инициализируются одновременно и `VideoEncoder` (H.264 MP4), и `GifEncoder`. В коллбэке `on_frame_arrived` для каждого кадра GIF на CPU выполняется тяжелое масштабирование `imageops::resize(..., FilterType::Triangle)`.
- **Влияние:** Избыточная загрузка процессора и просадки FPS при записи экранов высокого разрешения (1440p / 4K) даже тогда, когда пользователю нужно только MP4 видео.
- **Рекомендация:** Инициализировать GIF-энкодер только при явном выборе режима записи GIF, либо выполнять генерацию GIF по завершении записи из сохраненного мастер-видео.

---

#### 4.3.2. [BUG-13] Скачок таймлайна при паузе видеозаписи в Tauri
- **Затронутые файлы и строки:** `src-tauri/src/recording.rs`: строки 119–121, 134, 171
- **Первопричина:** Таймстамп кадра `frame.timestamp()?.Duration` считывается из таймера WMF Windows. Во время паузы (`paused = true`) входящие кадры отбрасываются, но системный таймер продолжает инкрементироваться. При возобновлении записи следующий переданный кадр имеет таймстамп с учетом времени простоя.
- **Влияние:** В итоговом MP4 файле возникает временной разрыв (видео замирает на длительность паузы).
- **Рекомендация:** Накапливать суммарную длительность времени в режиме паузы (`total_paused_duration`) и вычитать ее из таймстампа каждого активного кадра перед отправкой в `encoder.send_frame_buffer`.

---

#### 4.3.3. [BUG-14] Утечка Redo-стека при клике вне выделения и отсутствие Undo в Clear All
- **Затронутые файлы и строки:** `src/renderer/overlay.js`: строки 574–577, 839–846
- **Первопричина:** При клике вне текущей рамки выделения (`overlay.js:574`) очищается `overlayState.history = []`, но `overlayState.redoStack` не сбрасывается. Это позволяет применить Redo и восстановить старые фигуры на новое выделение. Кроме того, кнопка «Очистить всё» (`clearAllAnnotations`) мгновенно затирает и history, и redoStack без возможности отмены.
- **Влияние:** Нарушение консистентности истории рисования, случайное уничтожение всех аннотаций.
- **Рекомендация:** Добавить очистку `overlayState.redoStack = []` в строке 575; в `clearAllAnnotations` сохранять предыдущий массив в отдельное действие Undo `{ tool: 'clear_snapshot', previousHistory: [...] }`.

---

#### 4.3.4. [BUG-15] Пересоздание размеров холстов и неоптимизированный буфер размытия
- **Затронутые файлы и строки:** `src/renderer/overlay.js`: строки 617–621, 901–904
- **Первопричина:** При каждом кадре перерисовки кисти размытия свойства `blurEffectCanvas.width` и `height` перезаписываются. Изменение размеров холста в Chromium уничтожает графический контекст и заново выделяет текстуру в видеопамяти.
- **Влияние:** Микрофризы курсора и просадки FPS при быстром рисовании размытия.
- **Рекомендация:** Инициализировать вспомогательные канвасы один раз на полный размер экрана и очищать их через `ctx.clearRect(0, 0, width, height)`.

---

#### 4.3.5. [BUG-16] Ложный тост об ошибке сохранения при сбое запуска Проводника в Tauri
- **Затронутые файлы и строки:** `src-tauri/src/lib.rs`: строки 235–239
- **Фрагмент исходного кода:**
  ```rust
  let result = capture::save_data_url_to_path(&data_url, &file_path, settings.screenshots.auto_clipboard)?;
  let directory = file_path.parent().ok_or_else(|| "Не удалось определить папку".to_string())?;
  app.opener()
      .open_path(directory.to_string_lossy().into_owned(), None::<String>)
      .map_err(|error| {
          format!("Снимок сохранён, но не удалось открыть папку в Проводнике: {error}")
      })?;
  Ok(Some(result))
  ```
- **Первопричина:** Если системный вызов `open_path` падает (например, процесс `explorer.exe` завис или заблокирован), оператор `?` прерывает функцию и возвращает ошибку, из-за чего в `overlay.js` отображается красный тост сбоя сохранения, хотя файл уже успешно записан на диск.
- **Рекомендация:** Игнорировать результат вызова открытия папки (`let _ = app.opener().open_path(...)`) или логировать его без возврата ошибки в промис.

---

#### 4.3.6. [BUG-17] Накопление слушателей `ipcRenderer.on` в Preload
- **Затронутые файлы и строки:** `src/preload/index.js`: строки 28–39
- **Первопричина:** Методы подписки `onInitOverlay`, `onTriggerScreenshot`, `onNavigateTab` не возвращают функцию отписки (`disposer`). При перезагрузке окна рендера обработчики накапливаются на объекте `ipcRenderer`.
- **Рекомендация:** Возвращать замыкание `() => ipcRenderer.removeListener(channel, handler)` из всех методов подписки.

---

#### 4.3.7. [BUG-18] Избыточная папка `гитхаб/` с кириллическим именем
- **Затронутые файлы:** `гитхаб/AeroSnap-2.0-windows-x64-setup.exe` (1.6 МБ), `гитхаб/*.md`
- **Первопричина:** Неочищенный рабочий каталог, содержащий точные дубликаты релизных файлов из каталога `release/`.
- **Рекомендация:** Полностью удалить каталог `гитхаб/` из репозитория.

---

### 4.4. 🔵 UI/UX дефекты и функциональные улучшения (Low & Improvement / P3)

#### 4.4.1. [BUG-19] Гонка коммита активного текста при клике «Сохранить» / «Копировать»
- **Затронутые файлы:** `src/renderer/overlay.js`: строки 1112–1115, 1239–1274
- **Описание:** Обработчик потери фокуса `editor.addEventListener('blur')` вызывает коммит текста с задержкой `setTimeout(commitInlineText, 150)`. При быстром клике на кнопки панели действий функция сохранения запускается немедленно, до срабатывания таймера, в результате чего набранный текст не попадает на сохраненный скриншот.
- **Решение:** В начале функций `saveScreenshot`, `copyScreenshot`, `startVideoRecording` вызывать принудительный синхронный коммит `if (overlayState.activeTextEditor) commitInlineText();`.

---

#### 4.4.2. [BUG-20] Фиктивная настройка `dualMouseClick`
- **Затронутые файлы:** `src/main/store.js:17`, `src/renderer/settings.js:68, 100`, `src-tauri/src/settings.rs:22`
- **Описание:** Опция «Двойной клик мыши для снимка» отображается в окне настроек, но в кодовой базе отсутствует хук мыши (`WH_MOUSE_LL`). Чекбокс является заглушкой.
- **Решение:** Подключить нативный перехватчик мыши в Rust через `windows::Win32::UI::WindowsAndMessaging::SetWindowsHookExW` либо скрыть чекбокс из UI до реализации.

---

#### 4.4.3. [BUG-21] Отсутствие обратной связи при конфликте глобальных хоткеев в Electron
- **Затронутые файлы:** `src/main/shortcuts.js`: строки 18–37
- **Описание:** При сбое регистрации хоткея пишется только лог `console.warn`. Интерфейс настроек вводит пользователя в заблуждение, показывая занятый хоткей как успешно назначенный.
- **Решение:** Возвращать статус регистрации из метода `saveSettings` и выводить диалоговое предупреждение о коллизии.

---

#### 4.4.4. [BUG-22] Невалидный путь автозапуска в Portable-режиме Electron
- **Затронутые файлы:** `src/main/index.js`: строки 58–71
- **Описание:** Для portable exe `process.execPath` указывает на временный распакованный каталог `%TEMP%`, который очищается при перезагрузке ОС.
- **Решение:** Использовать переменную окружения `process.env.PORTABLE_EXECUTABLE_FILE`, если она определена.

---

#### 4.4.5. [BUG-23] Гонка клика и даблклика в трее Windows Electron
- **Затронутые файлы:** `src/main/tray.js`: строки 48–64
- **Описание:** Одиночный клик открывает оверлей, а двойной клик открывает настройки. При даблклике сначала запускается оверлей, а затем поверх него окно настроек.
- **Решение:** Добавить таймер задержки (200 мс) для одиночного клика, отменяемый при возникновении события `double-click`.

---

#### 4.4.6. [BUG-24] Unhandled Promise Rejection в настройках при открытии несуществующей папки
- **Затронутые файлы:** `src/renderer/settings.js`: строки 211–215; `src-tauri/src/lib.rs`: строки 84–88
- **Описание:** Клик по кнопке «Открыть папку» для несуществующего пути генерирует необработанное исключение промиса.
- **Решение:** Добавить `.catch(err => showToast(`Папка не найдена: ${err}`))`.

---

#### 4.4.7. [BUG-25] Устаревшее имя файла конфигурации `aerosnap-v1.5-config.json`
- **Затронутые файлы:** `src-tauri/src/settings.rs`: строка 114
- **Описание:** В кодовой базе версии 2.0 файл настроек по умолчанию называется `aerosnap-v1.5-config.json`.
- **Решение:** Изменить имя файла на `aerosnap-config.json` с поддержкой миграции со старых версий.

---

#### 4.4.8. [BUG-26] Отсутствие инструментов «Маркер / Хайлайтер» и «Эллипс»
- **Затронутые файлы:** `src/renderer/overlay.html`: строки 31–53; `src/renderer/overlay.js`: строка 87
- **Описание:** В панели инструментов отсутствуют базовые инструменты полупрозрачного выделения текста и обводки круглых элементов.
- **Решение:** Добавить кнопки и отрисовку через `ctx.ellipse()` и `ctx.globalCompositeOperation = 'multiply'`.

---

#### 4.4.9. [BUG-27] Устаревшая архитектурная документация в `docs/DECISIONS.md`
- **Затронутые файлы:** `docs/DECISIONS.md`: строки 1–58
- **Описание:** Документ описывает Electron как основной рантайм проекта, в то время как целевая версия 2.0 базируется на Tauri 2.0.
- **Решение:** Актуализировать документ под архитектуру Tauri 2.0 Rust.

---

### 4.5. 🔍 Дополнительные архитектурные скрытые дефекты и нюансы (GAP-01 — GAP-07)

В рамках экспертного анализа и сопоставления с результатами независимого аудита выявлены 7 скрытых архитектурных дефектов и уязвимостей рантайма:

#### 4.5.1. [GAP-01] Искажение кадрирования High-DPI в модуле нативной видео/GIF записи
- **Затронутые файлы и строки:** `src-tauri/src/recording.rs`: строки 325–340 (`clamp_rect`); `src-tauri/src/lib.rs`: строки 120–131
- **Фрагмент исходного кода:**
  ```rust
  // src-tauri/src/recording.rs:325-331
  fn clamp_rect(rect: CaptureRect, monitor_width: u32, monitor_height: u32) -> PixelRect {
      let x = rect.x.max(0.0).round() as u32;
      let y = rect.y.max(0.0).round() as u32;
      let x = x.min(monitor_width.saturating_sub(2));
      let y = y.min(monitor_height.saturating_sub(2));
      let mut width = (rect.w.max(2.0).round() as u32).min(monitor_width - x);
      let mut height = (rect.h.max(2.0).round() as u32).min(monitor_height - y);
  ```
- **Первопричина:** `clamp_rect` получает структуру `CaptureRect` с логическими координатами из окна Webview и напрямую преобразует их в физические пиксели `PixelRect` без умножения на `scale_factor` активного монитора.
- **Влияние на систему:** На экранах с масштабированием Windows 125–200% видео- и GIF-записи захватывают только верхнюю левую часть выделенной области.
- **Решение:** Передавать `scale_factor: f64` в `recording.start(...)` и функцию `clamp_rect`, масштабируя `(x, y, w, h)` перед кадрированием буфера `windows-capture`.

---

#### 4.5.2. [GAP-02] Мёртвый мост `saveVideo` и вызов незарегистрированной команды Tauri `video_save`
- **Затронутые файлы и строки:** `src/renderer/tauri-bridge.js`: строки 44–47; `src-tauri/src/lib.rs`: строки 476–496
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/tauri-bridge.js:44-47
  saveVideo: (bufferData, format) => invoke('video_save', {
    bufferData: Array.from(new Uint8Array(bufferData)),
    format,
  }),
  ```
- **Первопричина:** В `tauri-bridge.js` экспортирован метод `saveVideo`, вызывающий команду `video_save`. Однако в `src-tauri/src/lib.rs` в макросе `tauri::generate_handler!` команда `video_save` отсутствует и не реализована в Rust бэкенде (экспорт в Tauri выполняется через `recording_export`).
- **Влияние на систему:** Любой вызов `window.aeroAPI.saveVideo(...)` в среде Tauri немедленно завершается исключением `Error: command video_save not found`.
- **Решение:** Удалить мёртвый метод из `tauri-bridge.js` либо добавить корректный bridge fallback.

---

#### 4.5.3. [GAP-03] Утечка памяти Blob URL при ошибке загрузки фона или закрытии оверлея
- **Затронутые файлы и строки:** `src/renderer/overlay.js`: строки 152, 157–160; `src/renderer/tauri-bridge.js`: строки 22–24
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/overlay.js:148-159
  frozenScreen.onload = () => {
    ...
    URL.revokeObjectURL(data.backgroundDataUrl);
  };
  frozenScreen.onerror = () => {
    if (window.aeroAPI && window.aeroAPI.overlayReady) window.aeroAPI.overlayReady();
  };
  ```
- **Первопричина:** Освобождение `Blob URL` (`URL.revokeObjectURL`) происходит только при успешном событии `frozenScreen.onload`. При возникновении ошибки загрузки (`onerror`) или немедленном вызове `closeOverlay()` до завершения отрисовки память под Blob URL не освобождается.
- **Влияние на систему:** Прогрессирующее накопление неосвобожденных графических буферов в памяти Webview при повторных запусках оверлея.
- **Решение:** Вызывать `URL.revokeObjectURL(data.backgroundDataUrl)` в блоке `onerror` и в теле функции `closeOverlay()`.

---

#### 4.5.4. [GAP-04] Игнорирование настройки `audioBeep` при звуках видеозаписи
- **Затронутые файлы и строки:** `src/renderer/overlay.js`: строки 1496, 1553; `src-tauri/src/settings.rs`: строка 34
- **Фрагмент исходного кода:**
  ```javascript
  // src/renderer/overlay.js:1496, 1553
  if (window.SoundSynth) window.SoundSynth.playVideoStart();
  if (window.SoundSynth) window.SoundSynth.playVideoStop();
  ```
- **Первопричина:** Звуковые сигналы старта и завершения видеозаписи запускаются безусловно без проверки конфигурации `overlayState.settings.video?.audioBeep !== false`.
- **Влияние на систему:** Звуковые сигналы проигрываются даже в том случае, если пользователь отключил аудиоэффекты в настройках.
- **Решение:** Добавить проверку `if (window.SoundSynth && overlayState.settings.video?.audioBeep !== false)`.

---

#### 4.5.5. [GAP-05] Сбой команды `open_directory` при отсутствии папки на диске
- **Затронутые файлы и строки:** `src-tauri/src/lib.rs`: строки 84–88
- **Фрагмент исходного кода:**
  ```rust
  #[tauri::command]
  fn open_directory(app: AppHandle, target_path: String) -> Result<(), String> {
      app.opener()
          .open_path(target_path, None::<String>)
          .map_err(|error| error.to_string())
  }
  ```
- **Первопричина:** Если целевая папка ещё не была создана на диске (например, пользователь только установил программу и нажал «Открыть папку» в настройках), `open_path` возвращает системную ошибку Windows.
- **Влияние на систему:** Исключение `Unhandled Promise Rejection` в интерфейсе настроек и отказ Проводника открывать каталог.
- **Решение:** Добавить создание каталога `let _ = std::fs::create_dir_all(&target_path);` перед вызовом `open_path`.

---

#### 4.5.6. [GAP-06] Сбой восстановления свернутого окна настроек из панели задач Windows
- **Затронутые файлы и строки:** `src-tauri/src/lib.rs`: строки 319–322
- **Фрагмент исходного кода:**
  ```rust
  fn open_settings(app: &AppHandle) -> Result<(), String> {
      if let Some(window) = app.get_webview_window("settings") {
          let _ = window.show();
          let _ = window.set_focus();
          return Ok(());
      }
  ```
- **Первопричина:** На платформе Windows, если окно настроек было свернуто пользователем, метод `window.show()` не снимает статус минимизации, а `set_focus()` не может перевести фокус на свернутое окно.
- **Влияние на систему:** При клике в трее свернутое окно настроек остаётся в панели задач и не разворачивается перед пользователем.
- **Решение:** Добавить вызов `let _ = window.unminimize();` перед `window.show()` и `window.set_focus()`.

---

#### 4.5.7. [GAP-07] Безвозвратное удаление видеозаписи при нажатии Escape на панели ревью
- **Затронутые файлы и строки:** `src-tauri/src/lib.rs`: строки 107–117; `src-tauri/src/recording.rs`: строки 284, 318–322
- **Фрагмент исходного кода:**
  ```rust
  // src-tauri/src/lib.rs:107-117
  #[tauri::command]
  fn overlay_close(
      app: AppHandle,
      capture: State<'_, CaptureState>,
      recording: State<'_, recording::RecordingState>,
  ) {
      capture.clear();
      recording.cancel();
      if let Some(window) = app.get_webview_window("overlay") {
          let _ = window.hide();
      }
  }
  ```
- **Первопричина:** При завершении видеозаписи окно оверлея переходит в режим предпросмотра (`videoReviewBar`), а созданные файлы MP4 и GIF временно размещаются в каталоге `%TEMP%\AeroSnap\`. При нажатии клавиши Escape вызывается `overlay_close`, который безусловно выполняет `recording.cancel() -> discard_completed()`, стирая файлы с диска без запроса подтверждения.
- **Влияние на систему:** Случайное нажатие Esc в режиме предпросмотра приводит к безвозвратной утере только что записанного видеоматериала.
- **Решение:** В `overlay_close` вызывать `recording.cancel()` только при условии, что запись активна (`is_recording`). В режиме ожидания экспорта готовые временные файлы должны сохраняться до явного удаления по кнопке «Удалить» (`btn-video-discard`) или старта новой сессии захвата.

---

---

## 5. Глубокие технические аудиты подсистем

### 5.1. Полная матрица IPC-каналов и синхронизация рантаймов

Проведён сплошной аудит всех каналов межпроцессного взаимодействия для двух поддерживаемых сред выполнения (Electron ContextBridge и Tauri 2.0 Core Invoke):

| Интерфейс API (`window.aeroAPI`) | Тип | Реализация в Electron Preload | Обработчик в Electron Main | Команда в Tauri Rust Backend | Статус синхронизации |
|---|---|---|---|---|---|
| `getSettings()` | Async invoke | `settings:get` | `ipcMain.handle('settings:get')` | `#[tauri::command] settings_get` | ✅ Полная совместимость |
| `saveSettings(settings)` | Async invoke | `settings:save` | `ipcMain.handle('settings:save')` | `#[tauri::command] settings_save` | ⚠️ Контракт нарушен (в Electron возвращает `{ success, settings }`) |
| `selectDirectory(type)` | Async invoke | `dialog:select-directory` | `ipcMain.handle('dialog:select-directory')` | `#[tauri::command] select_directory` | ⚠️ Параметр `type` отбрасывается в `tauri-bridge.js`; `lib.rs` не задаёт стартовую папку |
| `openDirectory(path)` | Async invoke | `shell:open-directory` | `ipcMain.handle('shell:open-directory')` | `#[tauri::command] open_directory` | ⚠️ В Tauri падает, если папка не создана на диске (GAP-05) |
| `onInitOverlay(callback)` | Event listener | `ipcRenderer.on('init-overlay')` | `webContents.send('init-overlay')` | `overlay_init` + `listen('init-overlay')` | ✅ Совместимо |
| `closeOverlay()` | Action | `ipcRenderer.send('overlay:close')` | `ipcMain.on('overlay:close')` | `#[tauri::command] overlay_close` | ⚠️ В Tauri удаляет файлы при ревью видео (GAP-07) |
| `overlayReady()` | Action | ❌ **Отсутствует в preload** | ❌ Не обрабатывается | `#[tauri::command] overlay_ready` | ⚠️ Рассинхронизация |
| `grabScreenRect(rect)` | Async invoke | `capture:grab-screen-rect` | `ipcMain.handle('capture:grab-screen-rect')` | `#[tauri::command] capture_grab_screen_rect` | ✅ Совместимо |
| `copyScreenshot(dataUrl)` | Async invoke | `capture:copy-screenshot` | `ipcMain.handle('capture:copy-screenshot')` | `#[tauri::command] capture_copy_screenshot` | ✅ Совместимо |
| `saveScreenshot(dataUrl)` | Async invoke | `capture:save-screenshot` | `ipcMain.handle('capture:save-screenshot')` | `#[tauri::command] capture_save_screenshot` | ✅ Совместимо |
| `saveScreenshotAs(dataUrl)` | Async invoke | ❌ **Отсутствует в preload** | ❌ **Отсутствует в main** | `#[tauri::command] capture_save_screenshot_as` | 🔴 **Критический разрыв (BUG-01)** |
| `getDesktopSources()` | Async invoke | `capture:get-sources` | `ipcMain.handle('capture:get-sources')` | `#[tauri::command] capture_get_sources` | ✅ Совместимо (Tauri возвращает пустой список) |
| `recordingStart(rect)` | Async invoke | ❌ Отсутствует в preload | ❌ Не поддерживается | `#[tauri::command] recording_start` | ⚠️ Только Tauri (требует High-DPI фикса GAP-01) |
| `recordingStop()` | Async invoke | ❌ Отсутствует в preload | ❌ Не поддерживается | `#[tauri::command] recording_stop` | ⚠️ Только Tauri |
| `recordingTogglePause()` | Async invoke | ❌ Отсутствует в preload | ❌ Не поддерживается | `#[tauri::command] recording_toggle_pause` | ⚠️ Только Tauri |
| `recordingCancel()` | Async invoke | ❌ Отсутствует в preload | ❌ Не поддерживается | `#[tauri::command] recording_cancel` | ⚠️ Только Tauri |
| `recordingExport(fmt, path)`| Async invoke | ❌ Отсутствует в preload | ❌ Не поддерживается | `#[tauri::command] recording_export` | ⚠️ Только Tauri |
| `saveVideo(buf, format)` | Async invoke | `video:save` | `ipcMain.handle('video:save')` | ❌ **Команда video_save отсутствует в Rust** | 🔴 Фальшивый MP4 в Electron / Мёртвый мост (Ghost Bridge) в Tauri (GAP-02) |
| `playSound(type)` | Send / Call | `sound:play` | `ipcMain.on('sound:play')` | No-op (Web Audio в JS) | ✅ Совместимо |
| `showSettings()` / `show_settings` | Async invoke | N/A (меню трея / окно) | N/A | `#[tauri::command] show_settings` | ⚠️ Зарегистрирована в `lib.rs:248, 495`, но отсутствует в `tauri-bridge.js` |
| `onTriggerRecordVideo(cb)` | Event listener | `action:trigger-record-video` | `webContents.send('action:trigger-record-video')` | `emit('action:trigger-record-video')` | ✅ Совместимо (слушается в `overlay.js:1582`) |
| `onTriggerPauseVideo(cb)` | Event listener | `action:trigger-pause-video` | `webContents.send('action:trigger-pause-video')` | `emit('action:trigger-pause-video')` | ✅ Совместимо (слушается в `overlay.js:1592`) |
| `onTriggerScreenshot(cb)` | Event listener | `action:trigger-screenshot` | Не отправляется | Не отправляется | ⚪ Мёртвый канал (не используется в UI) |
| `onNavigateTab(cb)` | Event listener | `navigate:tab` | Не отправляется | Не отправляется | ⚪ Мёртвый канал (не используется в UI) |

#### Выявленные критические расхождения и артефакты IPC:
1. **Фантомный мост `saveVideo` (GAP-02)**: В `src/renderer/tauri-bridge.js:44-47` экспортируется метод `saveVideo`, отправляющий вызов `invoke('video_save', ...)`. Однако в макросе `tauri::generate_handler!` (`src-tauri/src/lib.rs:476-496`) команда `video_save` не зарегистрирована и в Rust-коде не реализована. При вызове генерируется необработанная ошибка `"command video_save not found"`.
2. **Потеря контекста папки в `selectDirectory`**: В `src/renderer/settings.js:203, 219` вызываются методы `selectDirectory('screenshot')` и `selectDirectory('video')`. В `src/renderer/tauri-bridge.js:16` аргумент отбрасывается (`selectDirectory: () => invoke('select_directory')`), а в `src-tauri/src/lib.rs:74-81` диалог `blocking_pick_folder()` вызывается без установки начального каталога (`set_directory`), сбрасывая контекст проводника.
3. **Неэкспортированная команда `show_settings`**: В `src-tauri/src/lib.rs:248-251` реализована и зарегистрирована команда `#[tauri::command] show_settings`, однако она отсутствует в объекте `window.aeroAPI` моста `tauri-bridge.js`.
4. **Мёртвые каналы событий**: Каналы `action:trigger-screenshot` и `navigate:tab` объявлены в `preload/index.js` и `tauri-bridge.js`, но никогда не инициируются бэкендами и не обрабатываются интерфейсом.

---

### 5.2. Математика кадрирования: мультимониторность и High-DPI масштабирование

#### 5.2.1. Модель виртуального рабочего стола Windows (Virtual Desktop Coordinate Space)
Windows объединяет все физические мониторы в единую виртуальную плоскость координат:
- **Основной монитор (Primary)**: Верхний левый угол всегда находится в точке `(0, 0)`.
- **Вторичный монитор слева (Secondary Left)**: При разрешении 1920x1080 координаты монитора: `X ∈ [-1920, 0)`, `Y ∈ [0, 1080)`.
- **Вторичный монитор сверху (Secondary Top)**: Координаты: `X ∈ [0, 1920)`, `Y ∈ [-1080, 0)`.

```
                    ┌────────────────────────┐
                    │  Secondary Top Monitor │
                    │  X: 0..1920, Y: -1080..0│
                    └───────────┬────────────┘
                                │
    ┌────────────────────────┐  ▼ ┌────────────────────────┐
    │ Secondary Left Monitor │ ───│ Primary Monitor (0,0)  │
    │ X: -1920..0, Y: 0..1080│    │ X: 0..1920, Y: 0..1080 │
    └────────────────────────┘    └────────────────────────┘
```

##### 5.2.2. Математический анализ дефекта DPI в Tauri (скриншоты `capture.rs` и видеозапись `recording.rs`)
Пусть монитор имеет физическое разрешение $W_{\text{phys}} \times H_{\text{phys}} = 3840 \times 2160$ и масштаб Windows $S = 2.0$ ($200\%$).
- Логическое разрешение Webview:
  $$W_{\text{log}} = \frac{W_{\text{phys}}}{S} = \frac{3840}{2.0} = 1920\text{ px},\quad H_{\text{log}} = \frac{H_{\text{phys}}}{S} = \frac{2160}{2.0} = 1080\text{ px}$$
- Пользователь выделяет область на экране: $x = 200$, $y = 150$, $w = 800$, $h = 600$ в логических пикселях.
- **Текущий некорректный код Rust в `capture.rs` и `recording.rs:clamp_rect`:**
  $$x_{\text{crop}} = \text{round}(x) = 200,\quad y_{\text{crop}} = \text{round}(y) = 150$$
  $$w_{\text{crop}} = \text{round}(w) = 800,\quad h_{\text{crop}} = \text{round}(h) = 600$$
- В физическом буфере кадра $3840 \times 2160$ (как в `xcap`, так и в `windows-capture`) эта область соответствует только верхнему левому сегменту $\left[\frac{200}{2}, \frac{150}{2}\right]$ логического экрана.
- **Корректные формулы преобразования:**
  - **Для скриншотов (`capture.rs`):**
    $$x_{\text{phys}} = \text{clamp}\left(\text{round}(x \times S),\, 0,\, W_{\text{phys}} - 1\right)$$
    $$y_{\text{phys}} = \text{clamp}\left(\text{round}(y \times S),\, 0,\, H_{\text{phys}} - 1\right)$$
    $$w_{\text{phys}} = \text{clamp}\left(\text{round}(w \times S),\, 1,\, W_{\text{phys}} - x_{\text{phys}}\right)$$
    $$h_{\text{phys}} = \text{clamp}\left(\text{round}(h \times S),\, 1,\, H_{\text{phys}} - y_{\text{phys}}\right)$$
  - **Для нативного видео/GIF энкодера (`recording.rs:clamp_rect`):**
    $$x_{\text{phys}} = \text{clamp}\left(\text{round}(x \times S),\, 0,\, W_{\text{phys}} - 2\right)$$
    $$y_{\text{phys}} = \text{clamp}\left(\text{round}(y \times S),\, 0,\, H_{\text{phys}} - 2\right)$$
    $$w_{\text{raw}} = \text{clamp}\left(\text{round}(w \times S),\, 2,\, W_{\text{phys}} - x_{\text{phys}}\right),\quad w_{\text{phys}} = w_{\text{raw}} - (w_{\text{raw}} \bmod 2)$$
    $$h_{\text{raw}} = \text{clamp}\left(\text{round}(h \times S),\, 2,\, H_{\text{phys}} - y_{\text{phys}}\right),\quad h_{\text{phys}} = h_{\text{raw}} - (h_{\text{raw}} \bmod 2)$$

---

### 5.3. Жизненный цикл MediaStream, захват экрана и кодирование видео/GIF

#### 5.3.1. Архитектура захвата в Tauri 2.0 vs Electron
- **Tauri 2.0 Backend**:
  - Захват рабочего стола выполняется через нативный модуль `windows-capture` (DirectX 11 / Windows Graphics Capture API).
  - Аппаратное кодирование видеопотока в H.264 MP4 через Windows Media Foundation (`VideoEncoder`).
  - Программное кодирование GIF через `image::codecs::gif::GifEncoder`.
  - Управление жизненным циклом потока осуществляется через атомарный флаг `CaptureControl`. При вызове `recording_stop()` или `recording_cancel()` поток WGC немедленно освобождает дескриптор захвата экрана и возвращает управление в ОС.
- **Electron Backend**:
  - Захват экрана инициируется через `desktopCapturer.getSources({ types: ['screen'] })` с последующим получением WebRTC `MediaStream` через `navigator.mediaDevices.getUserMedia`.
  - Кадрирование видео выполняется рендерером через `OffscreenCanvas.captureStream(30)`.
  - Кодирование осуществляется браузерным движком `MediaRecorder` с контейнером WebM.

#### 5.3.2. Верификация освобождения медиа-треков (MediaStream Track Teardown)
В соответствии с критериями приёмки `AGENTS.md` и `ORIGINAL_REQUEST.md`:
```javascript
// Правило гарантированного освобождения ресурсов:
if (overlayState.stream) {
  overlayState.stream.getTracks().forEach((track) => {
    track.stop();
  });
  overlayState.stream = null;
}
```
Аудит подтвердил: при штатном завершении записи через кнопку остановки треки закрываются. Однако при нажатии клавиши Escape во время активной записи вызов `closeOverlay()` в Electron уничтожает `BrowserWindow` до выполнения `track.stop()`, что может приводить к удержанию флага захвата экрана Windows до полной сборки мусора процессом. В Tauri поток контролируется нативным Rust рантаймом, где `stop_capture()` вызывается гарантированно в деструкторе сессии.

#### 5.3.3. Жизненный цикл Blob URL и предотвращение утечек памяти (GAP-03)
В мосте Tauri `tauri-bridge.js` байты захваченного фона передаются в виде Blob:
```javascript
const blob = new Blob([pngBytes], { type: 'image/png' });
data.backgroundDataUrl = URL.createObjectURL(blob);
```
Для предотвращения утечек в Webview вызов `URL.revokeObjectURL(data.backgroundDataUrl)` обязан производиться не только по событию `frozenScreen.onload`, но и при ошибке декодирования `frozenScreen.onerror`, а также при досрочном закрытии окна оверлея в `closeOverlay()`.

#### 5.3.4. Безопасность предпросмотра видеозаписи и обработка клавиши Escape (GAP-07)
После завершения захвата (`recording_stop`) пользователь переходит к просмотру видеоролика на панели `videoReviewBar`. Нажатие Escape в данном режиме должно закрывать оверлей, **не уничтожая** временные файлы ролика в `%TEMP%\AeroSnap\`. Вызов `recording.cancel() -> discard_completed()` допустим только при активной сессии записи либо при явном клике пользователя по кнопке «Удалить» (`btn-video-discard`).

#### 5.3.5. Интеграция звукового синтезатора и валидация настройки `audioBeep` (GAP-04)
Встроенный синтезатор звука `window.SoundSynth` генерирует звуковые эффекты на базе Web Audio API. При старте и остановке видеозаписи вызовы `playVideoStart()` и `playVideoStop()` обязаны валидировать пользовательскую настройку `overlayState.settings.video?.audioBeep !== false`, предотвращая нежелательное воспроизведение аудио при отключенном звуковом сопровождении.

---

### 5.4. Отказоустойчивость файловой системы, буфер обмена и обработка ошибок

#### 5.4.1. Сценарии сбоев файловой системы (Storage Resilience Matrix)

| Тестовый сценарий / Условие | Поведение Electron | Поведение Tauri 2.0 | Оценка отказоустойчивости |
|---|---|---|---|
| **Отмена диалога пользователем** | `saveScreenshotAs` отсутствует (краш) | Возвращает `Ok(None)`, оверлей остаётся открытым | 🟢 Идеально в Tauri |
| **Недопустимые символы Windows (`: * ? " < > \|`)** | Замена через regex в `index.js` | Санитайзинг через `sanitize_filename` в `capture.rs` | 🟢 Защищено |
| **Защищенный каталог / Отказ в доступе (EACCES)** | Возврат `{ success: false, error }` | Возврат `Err(std::io::Error)` в промис | 🟢 Без падения главного процесса |
| **Переполнение диска (ENOSPC)** | Перехват в `try/catch`, лог ошибки | Возврат `Err(std::io::Error)` | ⚠️ В оверлее ошибка видео не выводится в UI (BUG-10) |
| **Сбой открытия папки в Explorer** | Игнорируется | Ошибка `open_path` ломает статус сохранения (BUG-16) | ⚠️ Требуется исправление в Tauri |
| **Повреждение файла настроек при отключении питания** | Прямая запись `fs.writeFileSync` | Атомарная запись во временный файл `*.json.tmp` с `rename` | 🟢 Идеально в Tauri |

#### 5.4.2. Буфер обмена (Clipboard Isolation)
- В Tauri модуль `capture_copy_screenshot` использует библиотеку `arboard`.
- При возникновении конфликта доступа к буферу обмена Windows (`CLIPBRD_E_CANT_OPEN`) метод возвращает понятную ошибку, которая перехватывается в `overlay.js:1250` и выводится пользователю в виде уведомления `showOverlayMessage`, предотвращая потерю скриншота.

---

### 5.5. Анализ зависимостей, чистоты сборки и уязвимостей npm

#### 5.5.1. Анализ дерева пакетов и тулчейнов

```
AeroSnap 2.0 Root
├── package.json (devDependencies: @tauri-apps/cli ^2, electron ^34.2.0, electron-builder ^25.1.8)
├── src-tauri/Cargo.toml (Tauri 2.0, windows 0.61, windows-capture 2.0, xcap 0.8, arboard 3.0, image 0.25)
└── release/ (AeroSnap-2.0-windows-x64-setup.exe — 1.6 MB NSIS target)
```

#### 5.5.2. Сводка уязвимостей npm audit

```
# npm audit report
tar  <=7.5.20
Severity: critical
Arbitrary File Creation/Overwrite via hardlink target - GHSA-34x7-hfp2-rc4v
Arbitrary File Overwrite via hardlink directory recursion - GHSA-8qq5-rm4j-mr97
Arbitrary File Overwrite via hardlink directory bypass - GHSA-83g3-92jg-28cx
Depends on vulnerable versions of electron-builder -> 7-zip-bin

electron  <=40.10.2
Severity: high
34 CVEs (Context Isolation bypass, ASAR integrity, Blink Use-after-free)

builder-util-runtime  <9.7.0
Severity: high
Authorization Header Leak on Cross-Origin Redirect - GHSA-p2f4-r6v6-j797

14 vulnerabilities (13 high, 1 critical)
```

**Заключение по зависимостям:** Поскольку финальный бинарник `AeroSnap-2.0-windows-x64-setup.exe` собирается исключительно через Rust компилятор (`cargo build --release` / `tauri build`), данные уязвимости Node.js не попадают в скомпилированный дистрибутив конечного пользователя. Однако они представляют угрозу для среды разработки и CI/CD пайплайна.

---

## 6. Пошаговый план устранения дефектов (Phased Remediation Plan)

### Фаза 1: Критические исправления функционала (P0 — Critical Fixes)
- [ ] **1.1. Исправление High-DPI кадрирования в Tauri (`src-tauri/src/capture.rs`, `src-tauri/src/recording.rs` [BUG-04, GAP-01]):**
  - Считывать реальный `scale_factor` активного монитора в `begin()` и `recording_start()`.
  - В `capture.rs:crop_image` масштабировать логические координаты на `scale_factor` перед кадрированием буфера `xcap`.
  - В `recording.rs:clamp_rect` масштабировать `(x, y, w, h)` на `scale_factor` перед вычислением четных размеров `PixelRect` для `windows-capture`.
- [ ] **1.2. Исправление сохранения скриншотов в Electron (`src/preload/index.js`, `src/main/index.js` [BUG-01]):**
  - Экспортировать `saveScreenshotAs` в Preload ContextBridge.
  - Реализовать IPC-обработчик `capture:save-screenshot-as` с вызовом `dialog.showSaveDialog` и сохранением файла.
- [ ] **1.3. Исправление контракта настроек (`src/renderer/settings.js`, `src/main/store.js` [BUG-02]):**
  - В `settings.js` разворачивать `res.settings || res` перед вызовом `renderSettings()`.
  - В Electron `index.js` возвращать чистый объект настроек.
- [ ] **1.4. Устранение фальшивого сохранения видео/GIF в Electron (`src/renderer/overlay.js`, `src/main/index.js` [BUG-03]):**
  - Интегрировать упаковку кадров для GIF и транскодирование в H.264 MP4, либо зафиксировать официальный рантайм Tauri 2.0.

---

### Фаза 2: Высокий приоритет и системная стабильность (P1 — Stability & System Safety)
- [ ] **2.1. Удаление глобального хука `Escape` (`src/main/shortcuts.js` [BUG-06]):**
  - Удалить `globalShortcut.register('Escape')` и `globalShortcut.unregister('Escape')`.
  - Полагаться на локальный DOM-обработчик `keydown` в окне оверлея.
- [ ] **2.2. Защита от блокировки выключения Windows (`src/main/index.js` [BUG-07]):**
  - Добавить `app.on('before-quit', () => { app.isQuitting = true; })`.
- [ ] **2.3. Гарантированное освобождение медиа-потоков (`src/renderer/overlay.js` [BUG-05]):**
  - В `closeOverlay()` принудительно останавливать все треки `overlayState.stream.getTracks().forEach(t => t.stop())` и сбрасывать таймеры.
- [ ] **2.4. Сохранение геометрии аннотаций при перемещении рамки (`src/renderer/overlay.js` [BUG-11]):**
  - Добавить смещение координат объектов в `overlayState.history` на величину дельты перемещения `(dx, dy)`.
- [ ] **2.5. Вывод ошибок экспорта видео/GIF в UI (`src/renderer/overlay.js` [BUG-10]):**
  - В функции `exportNativeRecording` добавить `showOverlayMessage(`Не удалось сохранить запись: ${error}`, true)`.
- [ ] **2.6. Сохранение видеофайлов при закрытии панели ревью по Escape (`src-tauri/src/lib.rs`, `src-tauri/src/recording.rs` [GAP-07]):**
  - В `overlay_close` вызывать `recording.cancel()` только если запись активна (`is_recording`). Сохранять готовые MP4/GIF при ревью до явного удаления по кнопке «Удалить» (`btn-video-discard`) или старта новой сессии.
- [ ] **2.7. Очистка мёртвого моста `saveVideo` (`src/renderer/tauri-bridge.js` [GAP-02]):**
  - Удалить неиспользуемый вызов незарегистрированной команды `video_save` из `tauri-bridge.js`.
- [ ] **2.8. Предотвращение утечки памяти `Blob URL` (`src/renderer/overlay.js` [GAP-03]):**
  - Вызывать `URL.revokeObjectURL(data.backgroundDataUrl)` в `frozenScreen.onerror` и в `closeOverlay()`.

---

### Фаза 3: Очистка сборки и оптимизация ресурсов (P2 — Build, Cleanup & Perf)
- [ ] **3.1. Устранение дубликатов и мусорных файлов:**
  - Удалить папку `гитхаб/` (1.6 МБ дублирующих бинарников и документации [BUG-18]).
- [ ] **3.2. Очистка зависимостей и уязвимостей npm (`package.json` [BUG-09]):**
  - Удалить неиспользуемые пакеты Electron (`electron`, `electron-builder`) из `devDependencies`.
  - Обновить npm-скрипты на `"dev": "tauri dev"` и `"build": "tauri build"`.
- [ ] **3.3. Разделение энкодеров MP4 и GIF в Tauri (`src-tauri/src/recording.rs` [BUG-12]):**
  - Кодировать GIF только при явном выборе режима GIF, устранив двойную нагрузку на CPU при записи MP4.
- [ ] **3.4. Исправление скачка таймлайна при паузе (`src-tauri/src/recording.rs` [BUG-13]):**
  - Вычитать накопленную длительность паузы из таймстампа кадров WMF.
- [ ] **3.5. Устранение ложного тоста при сбое Explorer (`src-tauri/src/lib.rs` [BUG-16]):**
  - Не возвращать ошибку всей операции при сбое вызова `open_path`.
- [ ] **3.6. Автоматическое создание каталогов перед открытием в Проводнике (`src-tauri/src/lib.rs` [GAP-05]):**
  - В `open_directory` вызывать `std::fs::create_dir_all(&target_path)` перед `open_path`.
- [ ] **3.7. Валидация настройки `audioBeep` для звуковых эффектов (`src/renderer/overlay.js` [GAP-04]):**
  - Проверять `overlayState.settings.video?.audioBeep !== false` перед вызовами `playVideoStart()` и `playVideoStop()`.

---

### Фаза 4: UI/UX полировка и функциональные улучшения (P3 — Polish & Enhancements)
- [ ] **4.1. Устранение гонки активного текста перед сохранением (`src/renderer/overlay.js` [BUG-19]):**
  - Вызывать синхронный коммит `if (overlayState.activeTextEditor) commitInlineText()` перед вызовом `createMergedScreenshot()`.
- [ ] **4.2. Очистка Redo-стека при создании нового выделения (`src/renderer/overlay.js` [BUG-14]):**
  - Сбрасывать `overlayState.redoStack = []` при клике вне выделенной области.
- [ ] **4.3. Актуализация имени файла настроек (`src-tauri/src/settings.rs` [BUG-25]):**
  - Использовать `aerosnap-config.json` вместо `aerosnap-v1.5-config.json`.
- [ ] **4.4. Добавление недостающих инструментов аннотаций (`src/renderer/overlay.html`, `overlay.js` [BUG-26]):**
  - Добавить инструмент «Маркер / Хайлайтер» и «Эллипс».
- [ ] **4.5. Актуализация документации (`docs/DECISIONS.md` [BUG-27]):**
  - Обновить `docs/DECISIONS.md` под актуальную архитектуру Tauri 2.0.
- [ ] **4.6. Восстановление свернутого окна настроек (`src-tauri/src/lib.rs` [GAP-06]):**
  - Добавить вызов `window.unminimize()` перед `set_focus()` в функции `open_settings`.
- [ ] **4.7. Сохранение контекста папки в диалоге выбора директории (`src/renderer/tauri-bridge.js`, `src-tauri/src/lib.rs`):**
  - Передавать `type` из `settings.js` в `select_directory` и настраивать `set_directory` на текущий путь из конфигурации.

---

## 7. Матрица верификации критериев приёмки (Acceptance Criteria)

На основе требований `ORIGINAL_REQUEST.md`, `AGENTS.md` и результатов экспертного рецензирования:

| Критерий приёмки | Ожидаемый результат | Фактический результат аудита | Статус |
|---|---|---|---|
| **Синхронизация IPC-вызовов** | Все `ipcRenderer.invoke/send` имеют обработчики в `main` и безопасные мосты в `preload`. | Метод `saveScreenshotAs` отсутствует в Preload и Main Electron (BUG-01). Контракт `saveSettings` нарушен (BUG-02). Мёртвый мост `saveVideo` в Tauri (GAP-02). | ❌ Выявлены нарушения (BUG-01, BUG-02, GAP-02) |
| **High-DPI кадрирование и захват** | Координаты выделения корректно преобразуются в физические пиксели экрана при любом масштабировании Windows (100–250%). | В `capture.rs` и `recording.rs:clamp_rect` отсутствует умножение на `scale_factor`, что ломает скриншоты и видео на High-DPI (BUG-04, GAP-01). | ❌ Выявлены критические дефекты (BUG-04, GAP-01) |
| **Освобождение MediaStream и ресурсов** | Вызов `closeOverlay` гарантированно останавливает все медиа-потоки (`getTracks().forEach(t => t.stop())`), таймеры и освобождает Blob URL. | В Electron окно закрывается до остановки потока (BUG-05). В Tauri выявлена утечка Blob URL при ошибках оверлея (GAP-03). | ⚠️ Требуются доработки (BUG-05, GAP-03) |
| **Безопасность жизненного цикла видео** | Остановка записи и закрытие оверлея не приводят к случайной потере созданного медиаконтента. | Нажатие Escape в режиме предпросмотра видео (`videoReviewBar`) безвозвратно удаляет готовый ролик из `%TEMP%` (GAP-07). | ⚠️ Требуется доработка (GAP-07) |
| **Отказоустойчивость файловой системы** | Обработка ошибок сохранения (нет прав, диск переполнен, папка отсутствует) не приводит к падению бэкенда и корректно информирует пользователя. | Бэкенд стабилен. `open_directory` падает при отсутствии каталога (GAP-05), сбой Explorer выдаёт ложную ошибку (BUG-16), ошибки экспорта видео проглатываются в UI (BUG-10). | ⚠️ Требуются доработки UI и IO (BUG-10, BUG-16, GAP-05) |
| **Системное поведение окон и трея** | Окно настроек корректно восстанавливается из минимизированного состояния, автозагрузка и выключение Windows не блокируются. | `open_settings` не разворачивает свернутое окно (`unminimize` GAP-06). Electron блокирует выключение ПК (BUG-07). | ⚠️ Выявлены дефекты Windows UX (BUG-07, GAP-06) |
| **Документирование и отчёт** | Сформирован подробный структурированный отчёт `docs/AUDIT_REPORT.md` со ссылками на строки кода и пошаговым планом правок. | Полный детализированный отчёт с учётом экспертных замечаний Challenger 1 и Challenger 2 сформирован в `docs/AUDIT_REPORT.md`. | ✅ Полностью выполнено |

---

# AeroSnap — скриншотер фото и видео

AeroSnap — лёгкое приложение для создания скриншотов и записи экрана на Windows, вдохновлённое skrinshoter.ru.

[![Скачать AeroSnap 2.1](https://img.shields.io/badge/Скачать_AeroSnap_2.1-Windows_x64-0284c7?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.1.0)
[![Версия 2.1.0](https://img.shields.io/badge/Версия-v2.1.0-10b981?style=for-the-badge)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.1.0)

> 🚀 **[Скачать AeroSnap 2.1 (Windows Setup)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.1.0)** — готовый установщик программы доступен на вкладке [Releases](https://github.com/Eniggman/AeroSnap/releases).

---

![Оверлей захвата и инструменты AeroSnap](assets/screenshots/overlay.png)

## Возможности

- ✂️ **Захват выбранной области экрана:** моментальное выделение с точными размерами пикселей и поддержкой High-DPI масштабирования (125%–200%).
- 🎨 **Аннотации и рисование:** карандаш, стрелки, нумерация шагов (1, 2, 3...), прямоугольники и текст.
- 💧 **Мягкое Gaussian-размытие:** скрытие конфиденциальных данных кистью (рукой) или прямоугольной областью (клякса).
- ↩️ **История действий:** отмена (Undo) и повтор (Redo) любых изменений, быстрая очистка.
- 💾 **Умное сохранение:** системный диалог «Сохранить как» для PNG/JPG с автоматическим открытием папки.
- 📋 **Буфер обмена:** автоматическое копирование готового снимка или видео.
- 📹 **Запись экрана:** мгновенный нативный захват видео в формате MP4 (H.264 WMF) или GIF-анимаций.
- ⚙️ **Трей и горячие клавиши:** тихий запуск в трей, автозагрузка Windows, настраиваемые горячие клавиши.

![Настройки AeroSnap](assets/screenshots/settings.png)

## 📥 Скачать

Готовая версия 2.1 для Windows доступна во вкладке релизов:

- 💾 **[AeroSnap 2.1 Setup (.exe)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.1.0)**
- 📝 [Список изменений 2.1 (CHANGES_2.1.md)](release/CHANGES_2.1.md)
- 🔒 Контрольная сумма SHA-256: `612289D596914D55620E1F016B575F123583AD27A6D3914C6AD7B519F18F126F`

## Сборка из исходников

Требуются Rust, Windows WebView2 и Node.js с установленным Tauri CLI.

```powershell
npm install
npm run tauri:build
```

## Лицензия

[MIT](LICENSE)



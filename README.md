# AeroSnap — скриншотер фото и видео

AeroSnap — лёгкое приложение для создания скриншотов и записи экрана на Windows

[![Скачать AeroSnap 2.3](https://img.shields.io/badge/Скачать_AeroSnap_2.3-Windows_x64-0284c7?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.3.0)
[![Версия 2.3.0](https://img.shields.io/badge/Версия-v2.3.0-10b981?style=for-the-badge)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.3.0)

> 🚀 **[Скачать AeroSnap 2.3 (Windows Setup)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.3.0)** — готовый установщик программы доступен на вкладке [Releases](https://github.com/Eniggman/AeroSnap/releases).

---

![Оверлей захвата и инструменты AeroSnap](assets/screenshots/overlay.png)

## Возможности

- ✂️ **Захват выбранной области экрана:** моментальное выделение с точными размерами пикселей и поддержкой High-DPI масштабирования (125%–200%).
- 🎨 **Аннотации и рисование:** карандаш, стрелки, нумерация шагов (1, 2, 3...), прямоугольники и текст.
- 💧 **Мягкое Gaussian-размытие:** скрытие конфиденциальных данных кистью (рукой) или прямоугольной областью (клякса).
- ↩️ **История действий:** отмена (Undo) и повтор (Redo) любых изменений, быстрая очистка.
- 💾 **Умное сохранение:** системный диалог «Сохранить как» для PNG/JPG с автоматическим открытием папки.
- 📋 **Буфер обмена:** автоматическое копирование готового снимка или видео.
- 📹 **Запись экрана:** мгновенный нативный захват видео в формате MP4 (H.264 WMF) или GIF-анимаций с компенсацией пауз.
- ⚙️ **Трей и горячие клавиши:** тихий запуск в трей, автозагрузка Windows, настраиваемые горячие клавиши (PageUp для скриншота, Home для видео, Insert для паузы).

![Настройки AeroSnap](assets/screenshots/settings.png)

## 📥 Скачать

Готовая версия 2.3 для Windows доступна во вкладке релизов:

- 💾 **[AeroSnap 2.3 Setup (.exe)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.3.0)**
- 📝 [Список изменений 2.3 (CHANGES_2.3.md)](release/CHANGES_2.3.md)
- 🔒 Контрольная сумма SHA-256: `28848455B925617C1B8E97B61656D2FBBBE094FDAD641FF4D7B1AB49E7613B3E`

## Сборка из исходников

Требуются Rust, Windows WebView2 и Node.js с установленным Tauri CLI.

```powershell
npm install
npm run build
```

## Лицензия

[MIT](LICENSE)



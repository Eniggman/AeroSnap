# AeroSnap — скриншотер фото и видео

AeroSnap — лёгкое приложение для создания скриншотов и записи экрана на Windows, вдохновлённое skrinshoter.ru.

[![Скачать AeroSnap 2.2](https://img.shields.io/badge/Скачать_AeroSnap_2.2-Windows_x64-0284c7?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.2.0)
[![Версия 2.2.0](https://img.shields.io/badge/Версия-v2.2.0-10b981?style=for-the-badge)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.2.0)

> 🚀 **[Скачать AeroSnap 2.2 (Windows Setup)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.2.0)** — готовый установщик программы доступен на вкладке [Releases](https://github.com/Eniggman/AeroSnap/releases).

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
- ⚙️ **Трей и горячие клавиши:** тихий запуск в трей, автозагрузка Windows, настраиваемые горячие клавиши.

![Настройки AeroSnap](assets/screenshots/settings.png)

## 📥 Скачать

Готовая версия 2.2 для Windows доступна во вкладке релизов:

- 💾 **[AeroSnap 2.2 Setup (.exe)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.2.0)**
- 📝 [Список изменений 2.2 (CHANGES_2.2.md)](release/CHANGES_2.2.md)
- 🔒 Контрольная сумма SHA-256: `68F4862AD59F0D1B37C936278350FDFEF27CD79D3CCC96B868BA39C1A4E82EAC`

## Сборка из исходников

Требуются Rust, Windows WebView2 и Node.js с установленным Tauri CLI.

```powershell
npm install
npm run build
```

## Лицензия

[MIT](LICENSE)



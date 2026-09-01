# AeroSnap — скриншотер фото и видео

AeroSnap — лёгкое приложение для создания скриншотов и записи экрана на Windows, вдохновлённое skrinshoter.ru.

[![Скачать AeroSnap 2.0](https://img.shields.io/badge/Скачать_AeroSnap_2.0-Windows_x64-0284c7?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.0.0)
[![Версия 2.0.0](https://img.shields.io/badge/Версия-v2.0.0-10b981?style=for-the-badge)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.0.0)

> 🚀 **[Скачать AeroSnap 2.0 (Windows Setup)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.0.0)** — готовый установщик программы доступен на вкладке [Releases](https://github.com/Eniggman/AeroSnap/releases).

---

![Оверлей захвата и инструменты AeroSnap](assets/screenshots/overlay.png)

## Возможности

- ✂️ **Захват выбранной области экрана:** моментальное выделение с точными размерами пикселей.
- 🎨 **Аннотации и рисование:** карандаш, стрелки, нумерация шагов (1, 2, 3...), прямоугольники и текст.
- 💧 **Мягкое Gaussian-размытие:** скрытие конфиденциальных данных кистью (рукой) или прямоугольной областью (клякса).
- ↩️ **История действий:** отмена (Undo) и повтор (Redo) любых изменений, быстрая очистка.
- 💾 **Умное сохранение:** системный диалог «Сохранить как» для PNG/JPG с автоматическим открытием папки.
- 📋 **Буфер обмена:** автоматическое копирование готового снимка или видео.
- 📹 **Запись экрана:** мгновенный захват видео в формате MP4 или GIF-анимаций.
- ⚙️ **Трей и горячие клавиши:** тихий запуск в трей, автозагрузка Windows, настраиваемые горячие клавиши.

![Настройки AeroSnap](assets/screenshots/settings.png)

## 📥 Скачать

Готовая версия 2.0 для Windows доступна во вкладке релизов:

- 💾 **[AeroSnap 2.0 Setup (.exe)](https://github.com/Eniggman/AeroSnap/releases/tag/v2.0.0)**
- 📝 [Список изменений 2.0 (CHANGES_2.0.md)](release/CHANGES_2.0.md)
- 🔒 Контрольная сумма SHA-256: `C8A604B888690CF8A303A599360672D78A53511633BC5426F5A72CE15048CC79`

## Сборка из исходников

Требуются Rust, Windows WebView2 и Node.js с установленным Tauri CLI.

```powershell
npm install
npm run tauri:build
```

## Лицензия

[MIT](LICENSE)



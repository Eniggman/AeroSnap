# AeroSnap project rules

- Every user-facing patch increases the minor version by one tenth: `1.7`, then `1.8`, then `1.9`, then `2.0`. Do not use hundredth patch versions such as `1.7.1`.
- Keep the version synchronized in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Technical manifests may store the required SemVer form (`1.7.0`), but every user-facing label must show one decimal (`1.7`).
- The current AeroSnap version must be visible in all user-facing identity surfaces: the tray tooltip/menu, the application/shortcut name, and the Settings window title and header.
- Before packaging, verify those displayed values match the package version.

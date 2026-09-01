mod capture;
mod recording;
mod settings;

use capture::{CaptureRect, CaptureState, OverlayInit, SaveResult};
use settings::{Settings, SettingsStore};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn settings_get(store: State<'_, SettingsStore>) -> Settings {
    store.get()
}

#[tauri::command]
fn settings_save(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    settings: Settings,
) -> Result<Settings, String> {
    let previous = store.get();

    if let Err(error) = apply_shortcuts(&app, &settings) {
        let _ = apply_shortcuts(&app, &previous);
        return Err(error);
    }
    if let Err(error) = sync_autostart(&app, settings.general.auto_start) {
        let _ = apply_shortcuts(&app, &previous);
        let _ = sync_autostart(&app, previous.general.auto_start);
        return Err(error);
    }

    match store.replace(settings) {
        Ok(saved) => Ok(saved),
        Err(error) => {
            let _ = apply_shortcuts(&app, &previous);
            let _ = sync_autostart(&app, previous.general.auto_start);
            Err(error)
        }
    }
}

fn sync_autostart(app: &AppHandle, should_start: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    let is_enabled = autostart.is_enabled().map_err(|error| error.to_string())?;
    #[cfg(debug_assertions)]
    eprintln!("[AutoStart] requested={should_start}, current={is_enabled}");

    if is_enabled != should_start {
        if should_start {
            autostart.enable()
        } else {
            autostart.disable()
        }
        .map_err(|error| error.to_string())?;
    }

    let is_enabled = autostart.is_enabled().map_err(|error| error.to_string())?;
    if is_enabled != should_start {
        return Err("Windows не подтвердил изменение автозапуска AeroSnap".into());
    }

    Ok(())
}

#[tauri::command]
fn select_directory(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_directory(app: AppHandle, target_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&target_path);
    if !path.exists() {
        let _ = std::fs::create_dir_all(path);
    }
    app.opener()
        .open_path(target_path, None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn overlay_init(capture: State<'_, CaptureState>) -> Result<OverlayInit, String> {
    capture.current()
}

#[tauri::command]
fn overlay_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn capture_background(capture: State<'_, CaptureState>) -> Result<tauri::ipc::Response, String> {
    capture.background_png().map(tauri::ipc::Response::new)
}

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

#[tauri::command]
fn recording_start(
    window: tauri::WebviewWindow,
    rect: CaptureRect,
    recording: State<'_, recording::RecordingState>,
    capture: State<'_, CaptureState>,
    store: State<'_, SettingsStore>,
) -> Result<(), String> {
    window
        .set_content_protected(true)
        .map_err(|error| error.to_string())?;
    let scale_factor = capture.current().map(|init| init.scale_factor).unwrap_or(1.0);
    if let Err(error) = recording.start(rect, store.get().video.fps, scale_factor) {
        let _ = window.set_content_protected(false);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
fn recording_stop(
    window: tauri::WebviewWindow,
    recording: State<'_, recording::RecordingState>,
) -> Result<(), String> {
    recording.stop()?;
    window
        .set_content_protected(false)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn recording_toggle_pause(recording: State<'_, recording::RecordingState>) -> Result<bool, String> {
    recording.toggle_pause()
}

#[tauri::command]
fn recording_cancel(recording: State<'_, recording::RecordingState>) {
    recording.cancel();
}

#[tauri::command]
fn recording_export(
    format: String,
    copy_path: bool,
    recording: State<'_, recording::RecordingState>,
    store: State<'_, SettingsStore>,
) -> Result<SaveResult, String> {
    recording.export(&format, copy_path, &store)
}

#[tauri::command]
fn capture_grab_screen_rect(
    capture: State<'_, CaptureState>,
    rect: Option<CaptureRect>,
) -> Result<String, String> {
    capture.crop_data_url(rect)
}

#[tauri::command]
fn capture_copy_screenshot(data_url: String) -> Result<(), String> {
    capture::copy_data_url(&data_url)
}

#[tauri::command]
fn capture_save_screenshot(
    data_url: String,
    store: State<'_, SettingsStore>,
) -> Result<SaveResult, String> {
    capture::save_data_url(&data_url, &store)
}

#[tauri::command]
async fn capture_save_screenshot_as(
    app: AppHandle,
    window: WebviewWindow,
    data_url: String,
    store: State<'_, SettingsStore>,
) -> Result<Option<SaveResult>, String> {
    let settings = store.get();
    let extension = capture::expected_extension(&settings);
    let suggested_name = format!("{}.{}", capture::suggested_file_name(&settings), extension);
    let filter_name = if extension == "jpg" {
        "JPEG изображение"
    } else {
        "PNG изображение"
    };

    let selected = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_directory(&settings.screenshots.save_path)
        .set_file_name(suggested_name)
        .add_filter(filter_name, &[extension])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let mut file_path = selected.into_path().map_err(|error| error.to_string())?;
    let selected_extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if selected_extension.is_empty() {
        file_path.set_extension(extension);
    } else if !selected_extension.eq_ignore_ascii_case(extension)
        && !(extension == "jpg" && selected_extension.eq_ignore_ascii_case("jpeg"))
    {
        return Err(format!(
            "Выберите имя файла с расширением .{extension}, чтобы Windows могла безопасно подтвердить замену существующего файла"
        ));
    }

    let result =
        capture::save_data_url_to_path(&data_url, &file_path, settings.screenshots.auto_clipboard)?;
    let directory = file_path
        .parent()
        .ok_or_else(|| "Не удалось определить папку сохранённого снимка".to_string())?;
    app.opener()
        .open_path(directory.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| {
            format!("Снимок сохранён, но не удалось открыть папку в Проводнике: {error}")
        })?;
    Ok(Some(result))
}

#[tauri::command]
fn capture_get_sources() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
fn show_settings(app: AppHandle) -> Result<(), String> {
    open_settings(&app)
}

fn open_overlay(app: &AppHandle, mode: &str) -> Result<(), String> {
    let settings = app.state::<SettingsStore>().get();
    app.state::<CaptureState>().begin(mode, settings)?;

    if let Some(window) = app.get_webview_window("overlay") {
        window
            .emit("init-overlay", ())
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    build_overlay(app).map(|_| ())
}

fn build_overlay(app: &AppHandle) -> Result<WebviewWindow, String> {
    let title = format!("AeroSnap {}", display_version());
    let mut builder =
        WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
            .title(&title)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .focused(false)
            .transparent(true)
            .shadow(false);

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        builder = builder
            .position(position.x as f64 / scale, position.y as f64 / scale)
            .inner_size(size.width as f64 / scale, size.height as f64 / scale);
    }

    let window = builder.build().map_err(|error| error.to_string())?;
    disable_window_transitions(&window);
    Ok(window)
}

#[cfg(target_os = "windows")]
fn disable_window_transitions(window: &WebviewWindow) {
    use std::{ffi::c_void, mem::size_of};
    use windows::{
        core::BOOL,
        Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED},
    };

    if let Ok(hwnd) = window.hwnd() {
        let disabled = BOOL(1);
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &disabled as *const BOOL as *const c_void,
                size_of::<BOOL>() as u32,
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn disable_window_transitions(_window: &WebviewWindow) {}

fn open_settings(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let title = format!("AeroSnap v{} — Настройки", display_version());
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title(&title)
        .inner_size(860.0, 580.0)
        .min_inner_size(760.0, 520.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn apply_shortcuts(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let screenshot = settings.hotkeys.screenshot.trim();
    let pause_video = settings.hotkeys.pause_video.trim();
    if !screenshot.is_empty()
        && !pause_video.is_empty()
        && screenshot.eq_ignore_ascii_case(pause_video)
    {
        return Err("Одна горячая клавиша не может выполнять два действия".into());
    }

    let shortcuts = app.global_shortcut();
    shortcuts
        .unregister_all()
        .map_err(|error| format!("Не удалось обновить горячие клавиши: {error}"))?;
    let result = (|| {
        if !screenshot.is_empty() {
            shortcuts.register(screenshot).map_err(|error| {
                format!("Горячая клавиша «{screenshot}» занята или не поддерживается: {error}")
            })?;
        }
        if !pause_video.is_empty() {
            shortcuts.register(pause_video).map_err(|error| {
                format!("Горячая клавиша «{pause_video}» занята или не поддерживается: {error}")
            })?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = shortcuts.unregister_all();
    }
    result
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let version_label = format!("AeroSnap v{}", display_version());
    let version = MenuItemBuilder::with_id("version", &version_label)
        .enabled(false)
        .build(app)?;
    let screenshot = MenuItemBuilder::with_id("screenshot", "Сделать скриншот").build(app)?;
    let video = MenuItemBuilder::with_id("video", "Записать видео").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Настройки").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Выход").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&version, &screenshot, &video, &settings, &quit])
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip(&version_label)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "screenshot" => {
                let _ = open_overlay(app, "screenshot");
            }
            "video" => {
                let _ = open_overlay(app, "video");
            }
            "settings" => {
                let _ = open_settings(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let action = app.state::<SettingsStore>().get().general.tray_click_action;
                match action.as_str() {
                    "video" => {
                        let _ = open_overlay(app, "video");
                    }
                    "settings" => {
                        let _ = open_settings(app);
                    }
                    _ => {
                        let _ = open_overlay(app, "screenshot");
                    }
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn display_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
        .strip_suffix(".0")
        .unwrap_or(env!("CARGO_PKG_VERSION"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SettingsStore::load())
        .manage(CaptureState::default())
        .manage(recording::RecordingState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = open_settings(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("AeroSnap")
                .arg("--background")
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let settings = app.state::<SettingsStore>().get();
                    if let Ok(configured) = settings.hotkeys.screenshot.parse() {
                        if shortcut == &configured {
                            let _ = open_overlay(app, "screenshot");
                            return;
                        }
                    }
                    if let Ok(configured) = settings.hotkeys.pause_video.parse() {
                        if shortcut == &configured {
                            if let Some(window) = app.get_webview_window("overlay") {
                                let _ = window.emit("action:trigger-pause-video", ());
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            settings_get,
            settings_save,
            select_directory,
            open_directory,
            overlay_init,
            overlay_ready,
            capture_background,
            overlay_close,
            capture_grab_screen_rect,
            capture_copy_screenshot,
            capture_save_screenshot,
            capture_save_screenshot_as,
            capture_get_sources,
            recording_start,
            recording_stop,
            recording_toggle_pause,
            recording_cancel,
            recording_export,
            show_settings,
        ])
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            setup_tray(app.handle())?;
            let settings = app.state::<SettingsStore>().get();
            if let Err(error) = apply_shortcuts(app.handle(), &settings) {
                eprintln!("[Hotkeys] Не удалось зарегистрировать сочетание: {error}");
            }
            if let Err(error) = sync_autostart(app.handle(), settings.general.auto_start) {
                eprintln!("[AutoStart] Не удалось применить настройку: {error}");
            }
            build_overlay(app.handle()).map_err(std::io::Error::other)?;
            if !std::env::args().any(|argument| argument == "--background") {
                open_settings(app.handle()).map_err(std::io::Error::other)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run AeroSnap");
}

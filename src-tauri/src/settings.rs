use directories::{BaseDirs, UserDirs};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{fs, path::PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub auto_start: bool,
    pub quiet_mode: bool,
    pub tray_click_action: String,
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeySettings {
    pub screenshot: String,
    pub pause_video: String,
    pub dual_mouse_click: bool,
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotSettings {
    pub save_path: String,
    pub auto_clipboard: bool,
    pub format: String,
    pub filename_pattern: String,
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSettings {
    pub save_path: String,
    pub auto_clipboard: bool,
    pub format: String,
    pub fps: u32,
    pub audio_beep: bool,
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub general: GeneralSettings,
    pub hotkeys: HotkeySettings,
    pub screenshots: ScreenshotSettings,
    pub video: VideoSettings,
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        let pictures = UserDirs::new()
            .and_then(|dirs| dirs.picture_dir().map(ToOwned::to_owned))
            .unwrap_or_else(|| PathBuf::from("Pictures"));
        let root = pictures.join("AeroSnap");

        Self {
            general: GeneralSettings {
                auto_start: false,
                quiet_mode: false,
                tray_click_action: "show_selector".into(),
                extra: Map::new(),
            },
            hotkeys: HotkeySettings {
                screenshot: "Pause".into(),
                pause_video: "ScrollLock".into(),
                dual_mouse_click: false,
                extra: Map::new(),
            },
            screenshots: ScreenshotSettings {
                save_path: root.join("Screenshots").to_string_lossy().into_owned(),
                auto_clipboard: true,
                format: "png".into(),
                filename_pattern: "AeroSnap_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}".into(),
                extra: Map::new(),
            },
            video: VideoSettings {
                save_path: root.join("Videos").to_string_lossy().into_owned(),
                auto_clipboard: true,
                format: "mp4".into(),
                fps: 30,
                audio_beep: true,
                extra: Map::new(),
            },
            extra: Map::new(),
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    inner: RwLock<Settings>,
}

impl SettingsStore {
    pub fn load() -> Self {
        let base = BaseDirs::new()
            .map(|dirs| dirs.config_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let legacy_dir = base.join("aerosnap");
        let legacy_path = legacy_dir.join("aerosnap-config.json");
        let development_path = legacy_dir.join("aerosnap-v2-config.json");
        let path = legacy_dir.join("aerosnap-v1.5-config.json");
        let _ = fs::create_dir_all(&legacy_dir);

        let defaults = Settings::default();
        let source = if path.exists() {
            Some(path.as_path())
        } else if development_path.exists() {
            Some(development_path.as_path())
        } else if legacy_path.exists() {
            Some(legacy_path.as_path())
        } else {
            None
        };

        let settings = source
            .and_then(|candidate| fs::read_to_string(candidate).ok())
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .and_then(|value| merge_with_defaults(&defaults, value).ok())
            .unwrap_or(defaults);

        let store = Self {
            path,
            inner: RwLock::new(settings),
        };
        let _ = store.persist();
        store
    }

    pub fn get(&self) -> Settings {
        self.inner.read().clone()
    }

    pub fn replace(&self, settings: Settings) -> Result<Settings, String> {
        self.persist_value(&settings)?;
        *self.inner.write() = settings;
        Ok(self.get())
    }

    fn persist(&self) -> Result<(), String> {
        let settings = self.inner.read();
        self.persist_value(&settings)
    }

    fn persist_value(&self, settings: &Settings) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
        let temp = self.path.with_extension("json.tmp");
        fs::write(&temp, json).map_err(|e| e.to_string())?;
        fs::rename(&temp, &self.path).map_err(|e| e.to_string())
    }
}

fn merge_with_defaults(
    defaults: &Settings,
    incoming: Value,
) -> Result<Settings, serde_json::Error> {
    let mut merged = serde_json::to_value(defaults)?;
    merge_value(&mut merged, incoming);
    serde_json::from_value(merged)
}

fn merge_value(base: &mut Value, incoming: Value) {
    match (base, incoming) {
        (Value::Object(base_map), Value::Object(incoming_map)) => {
            for (key, value) in incoming_map {
                match base_map.get_mut(&key) {
                    Some(existing) => merge_value(existing, value),
                    None => {
                        base_map.insert(key, value);
                    }
                }
            }
        }
        (base_slot, incoming_value) => *base_slot = incoming_value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_partial_json_keeps_new_defaults() {
        let defaults = Settings::default();
        let incoming = serde_json::json!({
            "hotkeys": { "screenshot": "F6" },
            "screenshots": { "format": "jpg" }
        });
        let merged = merge_with_defaults(&defaults, incoming).unwrap();
        assert_eq!(merged.hotkeys.screenshot, "F6");
        assert_eq!(merged.hotkeys.pause_video, "ScrollLock");
        assert_eq!(merged.screenshots.format, "jpg");
        assert!(merged.screenshots.auto_clipboard);
    }

    #[test]
    fn unknown_fields_survive_merge_and_serialization() {
        let defaults = Settings::default();
        let incoming = serde_json::json!({
            "futureRoot": { "enabled": true },
            "screenshots": {
                "filenamePattern": "Shot_{counter}",
                "futureScreenshotOption": 42
            }
        });
        let merged = merge_with_defaults(&defaults, incoming).unwrap();
        let serialized = serde_json::to_value(merged).unwrap();

        assert_eq!(serialized["futureRoot"]["enabled"], true);
        assert_eq!(serialized["screenshots"]["futureScreenshotOption"], 42);
        assert_eq!(
            serialized["screenshots"]["filenamePattern"],
            "Shot_{counter}"
        );
    }
}

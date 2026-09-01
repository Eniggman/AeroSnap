use crate::settings::{Settings, SettingsStore};
use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Local;
use image::{DynamicImage, ImageFormat, RgbaImage};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, fs, io::Cursor, path::Path};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CaptureRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInit {
    pub mode: String,
    pub display_width: u32,
    pub display_height: u32,
    pub scale_factor: f64,
    pub background_data_url: String,
    pub settings: Settings,
}

struct CaptureSession {
    id: Uuid,
    image: RgbaImage,
    init: OverlayInit,
}

#[derive(Default)]
pub struct CaptureState {
    session: Mutex<Option<CaptureSession>>,
}

impl CaptureState {
    pub fn begin(&self, mode: &str, settings: Settings) -> Result<OverlayInit, String> {
        let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        let monitor = monitors
            .into_iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .ok_or_else(|| "Primary monitor was not found".to_string())?;
        let image = monitor.capture_image().map_err(|e| e.to_string())?;
        let (width, height) = image.dimensions();
        let init = OverlayInit {
            mode: mode.to_string(),
            display_width: width,
            display_height: height,
            scale_factor: 1.0,
            background_data_url: String::new(),
            settings,
        };
        *self.session.lock() = Some(CaptureSession {
            id: Uuid::new_v4(),
            image,
            init: init.clone(),
        });
        Ok(init)
    }

    pub fn current(&self) -> Result<OverlayInit, String> {
        self.session
            .lock()
            .as_ref()
            .map(|session| session.init.clone())
            .ok_or_else(|| "No active capture session".to_string())
    }

    pub fn crop_data_url(&self, rect: Option<CaptureRect>) -> Result<String, String> {
        let guard = self.session.lock();
        let session = guard
            .as_ref()
            .ok_or_else(|| "No active capture session".to_string())?;
        let image = match rect {
            Some(rect) => crop_image(&session.image, rect),
            None => session.image.clone(),
        };
        encode_png_data_url(&image)
    }

    pub fn background_png(&self) -> Result<Vec<u8>, String> {
        let guard = self.session.lock();
        let session = guard
            .as_ref()
            .ok_or_else(|| "No active capture session".to_string())?;
        encode_png(&session.image)
    }

    pub fn clear(&self) {
        *self.session.lock() = None;
    }

    #[allow(dead_code)]
    pub fn session_id(&self) -> Option<Uuid> {
        self.session.lock().as_ref().map(|session| session.id)
    }
}

fn crop_image(source: &RgbaImage, rect: CaptureRect) -> RgbaImage {
    let max_w = source.width();
    let max_h = source.height();
    let x = rect.x.max(0.0).round() as u32;
    let y = rect.y.max(0.0).round() as u32;
    let width = rect.w.max(1.0).round() as u32;
    let height = rect.h.max(1.0).round() as u32;
    let x = x.min(max_w.saturating_sub(1));
    let y = y.min(max_h.saturating_sub(1));
    let width = width.min(max_w.saturating_sub(x)).max(1);
    let height = height.min(max_h.saturating_sub(y)).max(1);
    image::imageops::crop_imm(source, x, y, width, height).to_image()
}

fn encode_png_data_url(image: &RgbaImage) -> Result<String, String> {
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(encode_png(image)?)
    ))
}

fn encode_png(image: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(image.clone())
        .write_to(&mut bytes, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(bytes.into_inner())
}

fn decode_data_url(data_url: &str) -> Result<DynamicImage, String> {
    let encoded = data_url
        .split_once(',')
        .map(|(_, data)| data)
        .ok_or_else(|| "Invalid image data URL".to_string())?;
    let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    image::load_from_memory(&bytes).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub success: bool,
    pub file_path: String,
    pub file_name: String,
}

pub fn copy_data_url(data_url: &str) -> Result<(), String> {
    let image = decode_data_url(data_url)?.to_rgba8();
    let (width, height) = image.dimensions();
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(ImageData {
            width: width as usize,
            height: height as usize,
            bytes: Cow::Owned(image.into_raw()),
        })
        .map_err(|e| e.to_string())
}

pub fn save_data_url(data_url: &str, store: &SettingsStore) -> Result<SaveResult, String> {
    let settings = store.get();
    let directory = Path::new(&settings.screenshots.save_path);
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let extension = expected_extension(&settings);
    let (file_name, file_path) = next_file_path(directory, extension)?;
    save_data_url_to_path(data_url, &file_path, settings.screenshots.auto_clipboard).map(
        |mut result| {
            result.file_name = file_name;
            result
        },
    )
}

pub fn expected_extension(settings: &Settings) -> &'static str {
    if settings.screenshots.format.eq_ignore_ascii_case("jpg") {
        "jpg"
    } else {
        "png"
    }
}

pub fn suggested_file_name(settings: &Settings) -> String {
    let now = Local::now();
    let mut pattern = settings.screenshots.filename_pattern.trim().to_string();
    if pattern.is_empty() {
        pattern = "AeroSnap_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}".into();
    } else if pattern.starts_with("Screenshot_") {
        pattern = pattern.replacen("Screenshot_", "AeroSnap_", 1);
    }

    let replacements = [
        ("{YYYY}", now.format("%Y").to_string()),
        ("{MM}", now.format("%m").to_string()),
        ("{DD}", now.format("%d").to_string()),
        ("{HH}", now.format("%H").to_string()),
        ("{mm}", now.format("%M").to_string()),
        ("{ss}", now.format("%S").to_string()),
        ("{date}", now.format("%Y-%m-%d").to_string()),
        ("{counter}", "1".into()),
    ];
    for (placeholder, value) in replacements {
        pattern = pattern.replace(placeholder, &value);
    }

    let sanitized: String = pattern
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect();
    let sanitized = sanitized.trim().trim_matches('.');
    if sanitized.is_empty() {
        "AeroSnap".into()
    } else {
        sanitized.into()
    }
}

pub fn save_data_url_to_path(
    data_url: &str,
    file_path: &Path,
    copy_to_clipboard: bool,
) -> Result<SaveResult, String> {
    let image = decode_data_url(data_url)?;
    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let mut encoded = Cursor::new(Vec::new());
    if extension == "jpg" || extension == "jpeg" {
        DynamicImage::ImageRgb8(image.to_rgb8())
            .write_to(&mut encoded, ImageFormat::Jpeg)
            .map_err(|error| error.to_string())?;
    } else {
        image
            .write_to(&mut encoded, ImageFormat::Png)
            .map_err(|error| error.to_string())?;
    }

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(file_path, encoded.into_inner()).map_err(|error| error.to_string())?;
    if copy_to_clipboard {
        copy_data_url(data_url)?;
    }

    Ok(SaveResult {
        success: true,
        file_path: file_path.to_string_lossy().into_owned(),
        file_name: file_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

fn next_file_path(
    directory: &Path,
    extension: &str,
) -> Result<(String, std::path::PathBuf), String> {
    let date = Local::now().format("%Y-%m-%d").to_string();
    for index in 1..100_000u32 {
        let file_name = format!("AeroSnap_{date}_{index}.{extension}");
        let path = directory.join(&file_name);
        if !path.exists() {
            return Ok((file_name, path));
        }
    }
    Err("Could not allocate a screenshot filename".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crop_is_clamped_to_source() {
        let source = RgbaImage::new(100, 80);
        let cropped = crop_image(
            &source,
            CaptureRect {
                x: 90.0,
                y: 70.0,
                w: 50.0,
                h: 50.0,
            },
        );
        assert_eq!(cropped.dimensions(), (10, 10));
    }
}

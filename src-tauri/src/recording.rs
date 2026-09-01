use crate::capture::{CaptureRect, SaveResult};
use crate::settings::SettingsStore;
use image::{
    codecs::gif::{GifEncoder, Repeat},
    imageops::FilterType,
    Delay, Frame as GifFrame, RgbaImage,
};
use parking_lot::Mutex;
use std::{
    error::Error,
    fs::{self, File},
    io::BufWriter,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use uuid::Uuid;
use windows_capture::{
    capture::{CaptureControl, Context, GraphicsCaptureApiHandler},
    encoder::{
        AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder,
        VideoSettingsSubType,
    },
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
};

type RecorderError = Box<dyn Error + Send + Sync>;
type RecorderControl = CaptureControl<Recorder, RecorderError>;

#[derive(Clone)]
struct RecorderFlags {
    rect: PixelRect,
    fps: u32,
    mp4_path: PathBuf,
    gif_path: PathBuf,
    paused: Arc<AtomicBool>,
}

#[derive(Clone, Copy)]
struct PixelRect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

struct Recorder {
    encoder: Option<VideoEncoder>,
    gif: Option<GifEncoder<BufWriter<File>>>,
    rect: PixelRect,
    paused: Arc<AtomicBool>,
    gif_size: (u32, u32),
    video_interval: Duration,
    gif_interval: Duration,
    last_video_frame: Option<Instant>,
    last_gif_frame: Option<Instant>,
    scratch: Vec<u8>,
}

impl Recorder {
    fn finish(&mut self) -> Result<(), RecorderError> {
        self.gif.take();
        if let Some(encoder) = self.encoder.take() {
            encoder.finish()?;
        }
        Ok(())
    }
}

impl GraphicsCaptureApiHandler for Recorder {
    type Flags = RecorderFlags;
    type Error = RecorderError;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let flags = ctx.flags;
        let video = VideoSettingsBuilder::new(flags.rect.width, flags.rect.height)
            .sub_type(VideoSettingsSubType::H264)
            .frame_rate(flags.fps)
            .bitrate(10_000_000);
        let encoder = VideoEncoder::new(
            video,
            AudioSettingsBuilder::default().disabled(true),
            ContainerSettingsBuilder::default(),
            &flags.mp4_path,
        )?;

        let gif_file = BufWriter::new(File::create(&flags.gif_path)?);
        let mut gif = GifEncoder::new(gif_file);
        gif.set_repeat(Repeat::Infinite)?;

        Ok(Self {
            encoder: Some(encoder),
            gif: Some(gif),
            rect: flags.rect,
            paused: flags.paused,
            gif_size: fit_within(flags.rect.width, flags.rect.height, 1280),
            video_interval: Duration::from_millis(1000 / flags.fps as u64),
            gif_interval: Duration::from_millis(1000 / 12),
            last_video_frame: None,
            last_gif_frame: None,
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.paused.load(Ordering::Relaxed) {
            return Ok(());
        }

        let now = Instant::now();
        let video_due = self
            .last_video_frame
            .is_none_or(|last| now.duration_since(last) >= self.video_interval);
        let gif_due = self
            .last_gif_frame
            .is_none_or(|last| now.duration_since(last) >= self.gif_interval);
        if !video_due && !gif_due {
            return Ok(());
        }

        let timestamp = frame.timestamp()?.Duration;
        let crop = frame.buffer_crop(
            self.rect.x,
            self.rect.y,
            self.rect.x + self.rect.width,
            self.rect.y + self.rect.height,
        )?;
        let pixels = crop.as_nopadding_buffer(&mut self.scratch);

        if gif_due {
            let mut rgba = pixels.to_vec();
            for pixel in rgba.chunks_exact_mut(4) {
                pixel.swap(0, 2);
            }
            if let Some(image) = RgbaImage::from_raw(self.rect.width, self.rect.height, rgba) {
                let image = if self.gif_size == (self.rect.width, self.rect.height) {
                    image
                } else {
                    image::imageops::resize(
                        &image,
                        self.gif_size.0,
                        self.gif_size.1,
                        FilterType::Triangle,
                    )
                };
                let delay = Delay::from_numer_denom_ms(1000, 12);
                if let Some(gif) = self.gif.as_mut() {
                    gif.encode_frame(GifFrame::from_parts(image, 0, 0, delay))?;
                }
                self.last_gif_frame = Some(now);
            }
        }

        if video_due {
            let mut bottom_up = pixels.to_vec();
            flip_rows(&mut bottom_up, self.rect.width, self.rect.height);
            if let Some(encoder) = self.encoder.as_mut() {
                encoder.send_frame_buffer(&bottom_up, timestamp)?;
            }
            self.last_video_frame = Some(now);
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.finish()
    }
}

struct ActiveRecording {
    control: RecorderControl,
    paused: Arc<AtomicBool>,
    mp4_path: PathBuf,
    gif_path: PathBuf,
}

struct CompletedRecording {
    mp4_path: PathBuf,
    gif_path: PathBuf,
}

#[derive(Default)]
pub struct RecordingState {
    active: Mutex<Option<ActiveRecording>>,
    completed: Mutex<Option<CompletedRecording>>,
}

impl RecordingState {
    pub fn start(&self, rect: CaptureRect, fps: u32, scale_factor: f64) -> Result<(), String> {
        if self.active.lock().is_some() {
            return Err("A recording is already active".into());
        }
        self.discard_completed();

        let monitor = Monitor::primary().map_err(|error| error.to_string())?;
        let width = monitor.width().map_err(|error| error.to_string())?;
        let height = monitor.height().map_err(|error| error.to_string())?;
        let rect = clamp_rect(rect, width, height, scale_factor);
        let temp = std::env::temp_dir().join("AeroSnap");
        fs::create_dir_all(&temp).map_err(|error| error.to_string())?;
        let id = Uuid::new_v4();
        let mp4_path = temp.join(format!("{id}.mp4"));
        let gif_path = temp.join(format!("{id}.gif"));
        let paused = Arc::new(AtomicBool::new(false));
        let flags = RecorderFlags {
            rect,
            fps: fps.clamp(10, 60),
            mp4_path: mp4_path.clone(),
            gif_path: gif_path.clone(),
            paused: paused.clone(),
        };
        let settings = Settings::new(
            monitor,
            CursorCaptureSettings::WithCursor,
            DrawBorderSettings::Default,
            SecondaryWindowSettings::Default,
            MinimumUpdateIntervalSettings::Default,
            DirtyRegionSettings::Default,
            ColorFormat::Bgra8,
            flags,
        );
        let control = Recorder::start_free_threaded(settings).map_err(|error| error.to_string())?;
        *self.active.lock() = Some(ActiveRecording {
            control,
            paused,
            mp4_path,
            gif_path,
        });
        Ok(())
    }

    pub fn toggle_pause(&self) -> Result<bool, String> {
        let active = self.active.lock();
        let active = active
            .as_ref()
            .ok_or_else(|| "No active recording".to_string())?;
        let paused = !active.paused.load(Ordering::Relaxed);
        active.paused.store(paused, Ordering::Relaxed);
        Ok(paused)
    }

    pub fn stop(&self) -> Result<(), String> {
        let active = self
            .active
            .lock()
            .take()
            .ok_or_else(|| "No active recording".to_string())?;
        active.paused.store(false, Ordering::Relaxed);
        let callback = active.control.callback();
        callback
            .lock()
            .finish()
            .map_err(|error| error.to_string())?;
        active.control.stop().map_err(|error| error.to_string())?;
        *self.completed.lock() = Some(CompletedRecording {
            mp4_path: active.mp4_path,
            gif_path: active.gif_path,
        });
        Ok(())
    }

    pub fn cancel(&self) {
        if let Some(active) = self.active.lock().take() {
            let callback = active.control.callback();
            let _ = callback.lock().finish();
            let _ = active.control.stop();
            remove_if_exists(&active.mp4_path);
            remove_if_exists(&active.gif_path);
        }
        self.discard_completed();
    }

    pub fn export(
        &self,
        format: &str,
        copy_path: bool,
        store: &SettingsStore,
    ) -> Result<SaveResult, String> {
        let completed = self.completed.lock();
        let completed = completed
            .as_ref()
            .ok_or_else(|| "No completed recording".to_string())?;
        let (source, extension) = if format.eq_ignore_ascii_case("gif") {
            (&completed.gif_path, "gif")
        } else {
            (&completed.mp4_path, "mp4")
        };
        let directory = PathBuf::from(store.get().video.save_path);
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let (file_name, target) = next_recording_path(&directory, extension)?;
        fs::copy(source, &target).map_err(|error| error.to_string())?;
        if copy_path {
            if let Ok(mut clipboard) = arboard::Clipboard::new() {
                let _ = clipboard.set_text(target.to_string_lossy().into_owned());
            }
        }
        Ok(SaveResult {
            success: true,
            file_path: target.to_string_lossy().into_owned(),
            file_name,
        })
    }

    fn discard_completed(&self) {
        if let Some(completed) = self.completed.lock().take() {
            remove_if_exists(&completed.mp4_path);
            remove_if_exists(&completed.gif_path);
        }
    }
}

fn clamp_rect(
    rect: CaptureRect,
    monitor_width: u32,
    monitor_height: u32,
    scale_factor: f64,
) -> PixelRect {
    let scale = if scale_factor > 0.0 { scale_factor } else { 1.0 };
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

fn fit_within(width: u32, height: u32, max_side: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest <= max_side {
        return (width, height);
    }
    let scale = max_side as f64 / longest as f64;
    (
        ((width as f64 * scale).round() as u32).max(1),
        ((height as f64 * scale).round() as u32).max(1),
    )
}

fn flip_rows(buffer: &mut [u8], width: u32, height: u32) {
    let stride = width as usize * 4;
    for y in 0..height as usize / 2 {
        let opposite = height as usize - 1 - y;
        let (head, tail) = buffer.split_at_mut(opposite * stride);
        head[y * stride..(y + 1) * stride].swap_with_slice(&mut tail[..stride]);
    }
}

fn next_recording_path(directory: &Path, extension: &str) -> Result<(String, PathBuf), String> {
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    for index in 1..10_000u32 {
        let file_name = format!("AeroSnap_{stamp}_{index}.{extension}");
        let path = directory.join(&file_name);
        if !path.exists() {
            return Ok((file_name, path));
        }
    }
    Err("Could not allocate a recording filename".into())
}

fn remove_if_exists(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gif_size_preserves_aspect_ratio() {
        assert_eq!(fit_within(1920, 1080, 1280), (1280, 720));
        assert_eq!(fit_within(800, 600, 1280), (800, 600));
    }

    #[test]
    fn encoder_dimensions_are_even() {
        let rect = clamp_rect(
            CaptureRect {
                x: 1.0,
                y: 1.0,
                w: 101.0,
                h: 99.0,
            },
            1920,
            1080,
            1.0,
        );
        assert_eq!((rect.width, rect.height), (100, 98));
    }

    #[test]
    fn clamp_rect_scales_with_dpi() {
        let rect = clamp_rect(
            CaptureRect {
                x: 10.0,
                y: 20.0,
                w: 100.0,
                h: 50.0,
            },
            1920,
            1080,
            1.5,
        );
        assert_eq!(rect.x, 15);
        assert_eq!(rect.y, 30);
        assert_eq!(rect.width, 150);
        assert_eq!(rect.height, 74); // 75 - 75%2 = 74 (even)
    }

    #[test]
    #[ignore = "captures the live Windows desktop"]
    fn native_capture_smoke() {
        let state = RecordingState::default();
        state
            .start(
                CaptureRect {
                    x: 0.0,
                    y: 0.0,
                    w: 320.0,
                    h: 240.0,
                },
                30,
                1.0,
            )
            .unwrap();
        std::thread::sleep(Duration::from_millis(1200));
        state.stop().unwrap();

        let completed = state.completed.lock();
        let recording = completed.as_ref().unwrap();
        assert!(fs::metadata(&recording.mp4_path).unwrap().len() > 0);
        assert!(fs::metadata(&recording.gif_path).unwrap().len() > 0);
        drop(completed);
        state.discard_completed();
    }
}

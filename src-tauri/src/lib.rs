use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter,
    Manager,
    RunEvent,
    WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

// Debounce duration for global shortcut (prevents spam when key is held)
const SHORTCUT_DEBOUNCE_MS: u64 = 300;

#[tauri::command]
fn get_config() -> Result<serde_json::Value, String> {
    let config_path = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("ama-agent")
        .join("config.json");

    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({
            "whisperUrl": "https://api.openai.com/v1/audio/transcriptions",
            "whisperApiKey": "",
            "llmProvider": "openai",
            "llmApiKey": ""
        }))
    }
}

#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config directory")?
        .join("ama-agent");

    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let config_path = config_dir.join("config.json");
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn hide_to_tray(window: tauri::Window) -> Result<(), String> {
    window.emit("window-hidden", ()).map_err(|e| e.to_string())?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Track last shortcut activation time for debounce
    let last_shortcut_time: Arc<Mutex<Instant>> = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));

    let shortcut_time_clone = last_shortcut_time.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(move |app| {
            // Create tray menu
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Build tray icon with app icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("window-shown", ());
                        }
                    }
                })
                .build(app)?;

            // Register global shortcut: Ctrl+Shift+Space with debounce
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            let app_handle = app.handle().clone();
            let shortcut_time = shortcut_time_clone.clone();

            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                // Debounce check
                let now = Instant::now();
                {
                    let mut last_time = shortcut_time.lock().unwrap();
                    if now.duration_since(*last_time) < Duration::from_millis(SHORTCUT_DEBOUNCE_MS) {
                        return; // Ignore - too soon since last activation
                    }
                    *last_time = now;
                }

                if let Some(window) = app_handle.get_webview_window("main") {
                    // Toggle window visibility
                    if window.is_visible().unwrap_or(false) {
                        // Window is visible - emit action event to let frontend handle based on state
                        let _ = window.emit("shortcut-action", ());
                    } else {
                        // Show window and emit event to start recording
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("window-shown", ());
                    }
                }
            })?;

            // Show window on startup in dev mode
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_config, save_config, hide_to_tray])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Handle window close request - hide to tray instead of closing
            if let RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } = event {
                if label == "main" {
                    // Prevent the window from being closed
                    api.prevent_close();
                    // Hide window and emit event
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("window-hidden", ());
                        let _ = window.hide();
                    }
                }
            }
        });
}


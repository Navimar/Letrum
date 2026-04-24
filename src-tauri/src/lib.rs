use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    path: String,
    relative_path: String,
    content: String,
}

#[derive(Deserialize)]
struct SaveFile {
    path: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFilePayload {
    folder_path: String,
    relative_path: String,
}

#[derive(Deserialize)]
struct DeleteFilePayload {
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameFilePayload {
    folder_path: String,
    path: String,
    title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderFilesPayload {
    folder_path: String,
    ordered_paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAndInsertFilePayload {
    folder_path: String,
    ordered_paths: Vec<String>,
    selected_paths: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PathMapping {
    old_path: String,
    new_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReorderResult {
    files: Vec<ProjectFile>,
    path_map: Vec<PathMapping>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    files: Vec<ProjectFile>,
    path_map: Vec<PathMapping>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateAndInsertResult {
    files: Vec<ProjectFile>,
    path_map: Vec<PathMapping>,
    created_path: String,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    last_opened_folder: Option<String>,
}

const AUTO_TITLE_MAX_CHARS: usize = 48;

fn strip_numeric_prefix(name: &str) -> &str {
    let bytes = name.as_bytes();
    let mut index = 0;

    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index > 0
        && index < bytes.len()
        && (bytes[index] == b'_' || bytes[index] == b'-' || bytes[index] == b' ')
    {
        index += 1;
    }

    if index > 0 && index < bytes.len() {
        &name[index..]
    } else {
        name
    }
}

fn numeric_prefix(name: &str) -> &str {
    let bytes = name.as_bytes();
    let mut index = 0;

    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index > 0
        && index < bytes.len()
        && (bytes[index] == b'_' || bytes[index] == b'-' || bytes[index] == b' ')
    {
        index += 1;
    }

    &name[..index]
}

fn is_standard_generated_title(title: &str) -> bool {
    title == "new-scene"
}

fn truncate_title(title: &str, max_chars: usize) -> String {
    title.chars().take(max_chars).collect::<String>()
}

fn sanitized_auto_title(content: &str) -> Option<String> {
    let normalized = content.replace("\r\n", "\n");
    let first_sentence = normalized.split('.').next()?.trim();

    if first_sentence.is_empty() {
        return None;
    }

    let mut title = String::new();
    let mut previous_was_space = false;

    for character in truncate_title(first_sentence, AUTO_TITLE_MAX_CHARS).chars() {
        let safe_character = match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            character if character.is_control() => ' ',
            character => character,
        };

        if safe_character.is_whitespace() {
            if !previous_was_space {
                title.push(' ');
                previous_was_space = true;
            }
            continue;
        }

        title.push(safe_character);
        previous_was_space = false;
    }

    let title = title.trim().trim_matches('.').trim().to_string();

    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

fn unique_path(parent: &Path, file_name: &str, extension: &str, original: &Path) -> PathBuf {
    let mut candidate = parent.join(format!("{}.{}", file_name, extension));

    if candidate == original || !candidate.exists() {
        return candidate;
    }

    let mut index = 2usize;
    loop {
        candidate = parent.join(format!("{} {}.{}", file_name, index, extension));

        if candidate == original || !candidate.exists() {
            return candidate;
        }

        index += 1;
    }
}

fn project_file_from_path(root: &Path, path: &Path) -> Result<ProjectFile, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let relative_path = path
        .strip_prefix(root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");

    Ok(ProjectFile {
        path: path.to_string_lossy().into_owned(),
        relative_path,
        content,
    })
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;

    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    Ok(config_dir.join("settings.json"))
}

fn reorder_files_internal(root: &Path, ordered_paths: &[String]) -> Result<ReorderResult, String> {
    if ordered_paths.is_empty() {
        return Err("No files provided for reorder.".into());
    }

    let width = ordered_paths.len().max(3).to_string().len().max(3);
    let mut temporary_paths = Vec::new();
    let mut metadata: HashMap<String, (PathBuf, String)> = HashMap::new();

    for (index, original_path) in ordered_paths.iter().enumerate() {
        let original = PathBuf::from(original_path);

        if !original.exists() {
            return Err(format!("File does not exist: {}", original_path));
        }

        let file_name = original
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("Invalid file name: {}", original_path))?;

        let parent = original
            .parent()
            .ok_or_else(|| format!("Invalid parent folder: {}", original_path))?
            .to_path_buf();

        let clean_name = strip_numeric_prefix(file_name).to_string();
        let temp_path = parent.join(format!(".__tmp_reorder__{:04}_{}", index, file_name));

        fs::rename(&original, &temp_path).map_err(|error| error.to_string())?;
        temporary_paths.push((original_path.clone(), temp_path));
        metadata.insert(original_path.clone(), (parent, clean_name));
    }

    let mut path_map = Vec::new();

    for (index, original_path) in ordered_paths.iter().enumerate() {
        let temp_path = temporary_paths
            .iter()
            .find(|(old_path, _)| old_path == original_path)
            .map(|(_, temp)| temp.clone())
            .ok_or_else(|| format!("Temporary path missing for {}", original_path))?;

        let (parent, clean_name) = metadata
            .get(original_path)
            .ok_or_else(|| format!("Metadata missing for {}", original_path))?;

        let new_file_name = format!("{:0width$}_{}", index + 1, clean_name, width = width);
        let new_path = parent.join(new_file_name);
        fs::rename(&temp_path, &new_path).map_err(|error| error.to_string())?;

        path_map.push(PathMapping {
            old_path: original_path.clone(),
            new_path: new_path.to_string_lossy().into_owned(),
        });
    }

    let mut files = Vec::new();
    collect_files(root, root, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(ReorderResult { files, path_map })
}

fn collect_files(
    root: &Path,
    current: &Path,
    results: &mut Vec<ProjectFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|error| error.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            collect_files(root, &path, results)?;
            continue;
        }

        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };

        if extension != "md" && extension != "txt" {
            continue;
        }

        let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let relative_path = path
            .strip_prefix(root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        results.push(ProjectFile {
            path: path.to_string_lossy().into_owned(),
            relative_path,
            content,
        });
    }

    Ok(())
}

#[tauri::command]
fn load_project(folder_path: String) -> Result<Vec<ProjectFile>, String> {
    let root = PathBuf::from(folder_path);

    if !root.exists() {
        return Err("Folder does not exist.".into());
    }

    if !root.is_dir() {
        return Err("Path is not a folder.".into());
    }

    let mut files = Vec::new();
    collect_files(&root, &root, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

#[tauri::command]
fn save_project(folder_path: String, files: Vec<SaveFile>) -> Result<SaveResult, String> {
    let root = PathBuf::from(folder_path);

    if !root.exists() || !root.is_dir() {
        return Err("Folder does not exist.".into());
    }

    let mut saved_files = Vec::new();
    let mut path_map = Vec::new();

    for file in files {
        let original = PathBuf::from(&file.path);

        original
            .strip_prefix(&root)
            .map_err(|_| "File is outside the project folder.".to_string())?;

        let parent = original
            .parent()
            .ok_or_else(|| "File has no parent directory.".to_string())?;

        let file_stem = original
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Invalid file name.".to_string())?;

        let extension = original
            .extension()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "File has no extension.".to_string())?;

        let mut target_path = original.clone();
        let clean_title = strip_numeric_prefix(file_stem);

        if is_standard_generated_title(clean_title) {
            if let Some(auto_title) = sanitized_auto_title(&file.content) {
                let target_file_name = format!("{}{}", numeric_prefix(file_stem), auto_title);
                target_path = unique_path(parent, &target_file_name, extension, &original);
            }
        }

        if target_path != original {
            fs::rename(&original, &target_path).map_err(|error| error.to_string())?;
            path_map.push(PathMapping {
                old_path: file.path.clone(),
                new_path: target_path.to_string_lossy().into_owned(),
            });
        }

        fs::write(&target_path, file.content).map_err(|error| error.to_string())?;
        saved_files.push(project_file_from_path(&root, &target_path)?);
    }

    Ok(SaveResult {
        files: saved_files,
        path_map,
    })
}

#[tauri::command]
fn create_file(payload: CreateFilePayload) -> Result<ProjectFile, String> {
    let root = PathBuf::from(payload.folder_path);

    if !root.exists() || !root.is_dir() {
        return Err("Folder does not exist.".into());
    }

    let relative = payload.relative_path.trim();
    if relative.is_empty() {
        return Err("File path cannot be empty.".into());
    }

    let path = root.join(relative);
    if path.exists() {
        return Err("File already exists.".into());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(&path, "").map_err(|error| error.to_string())?;

    Ok(ProjectFile {
        path: path.to_string_lossy().into_owned(),
        relative_path: path
            .strip_prefix(&root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/"),
        content: String::new(),
    })
}

#[tauri::command]
fn delete_file(payload: DeleteFilePayload) -> Result<(), String> {
    let path = PathBuf::from(payload.path);

    if !path.exists() {
        return Err("File does not exist.".into());
    }

    fs::remove_file(path).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn rename_file(payload: RenameFilePayload) -> Result<ProjectFile, String> {
    let root = PathBuf::from(&payload.folder_path);

    if !root.exists() || !root.is_dir() {
        return Err("Folder does not exist.".into());
    }

    let original = PathBuf::from(&payload.path);
    if !original.exists() || !original.is_file() {
        return Err("File does not exist.".into());
    }

    original
        .strip_prefix(&root)
        .map_err(|_| "File is outside the project folder.".to_string())?;

    let parent = original
        .parent()
        .ok_or_else(|| "File has no parent directory.".to_string())?;

    let file_name = original
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid file name.".to_string())?;

    let extension = original
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "File has no extension.".to_string())?;

    let mut title = payload.title.trim().to_string();
    let extension_suffix = format!(".{}", extension);
    if title
        .to_lowercase()
        .ends_with(&extension_suffix.to_lowercase())
    {
        title.truncate(title.len() - extension_suffix.len());
        title = title.trim().to_string();
    }

    if title.is_empty() {
        return Err("File title cannot be empty.".into());
    }

    if title.contains('/') || title.contains('\\') || title == "." || title == ".." {
        return Err("File title cannot contain path separators.".into());
    }

    let new_file_name = format!("{}{}.{}", numeric_prefix(file_name), title, extension);
    let new_path = parent.join(new_file_name);

    if new_path != original && new_path.exists() {
        return Err("File already exists.".into());
    }

    fs::rename(&original, &new_path).map_err(|error| error.to_string())?;

    let content = fs::read_to_string(&new_path).map_err(|error| error.to_string())?;
    let relative_path = new_path
        .strip_prefix(&root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/");

    Ok(ProjectFile {
        path: new_path.to_string_lossy().into_owned(),
        relative_path,
        content,
    })
}

#[tauri::command]
fn reorder_files(payload: ReorderFilesPayload) -> Result<ReorderResult, String> {
    let root = PathBuf::from(&payload.folder_path);

    if !root.exists() || !root.is_dir() {
        return Err("Folder does not exist.".into());
    }

    reorder_files_internal(&root, &payload.ordered_paths)
}

#[tauri::command]
fn create_and_insert_file(
    payload: CreateAndInsertFilePayload,
) -> Result<CreateAndInsertResult, String> {
    let root = PathBuf::from(&payload.folder_path);

    if !root.exists() || !root.is_dir() {
        return Err("Folder does not exist.".into());
    }

    let insert_after_index = if payload.selected_paths.is_empty() {
        payload.ordered_paths.len()
    } else {
        payload
            .ordered_paths
            .iter()
            .enumerate()
            .filter(|(_, path)| payload.selected_paths.contains(path))
            .map(|(index, _)| index + 1)
            .max()
            .unwrap_or(payload.ordered_paths.len())
    };

    let parent_dir = if payload.selected_paths.is_empty() {
        root.clone()
    } else {
        let last_selected_path = payload
            .ordered_paths
            .iter()
            .rev()
            .find(|path| payload.selected_paths.contains(path))
            .ok_or_else(|| "Selected files are not present in the ordered list.".to_string())?;

        PathBuf::from(last_selected_path)
            .parent()
            .ok_or_else(|| "Selected file has no parent directory.".to_string())?
            .to_path_buf()
    };

    let created_path = parent_dir.join("new-scene.md");
    fs::write(&created_path, "").map_err(|error| error.to_string())?;

    let created_path_string = created_path.to_string_lossy().into_owned();
    let mut ordered_paths = payload.ordered_paths.clone();
    ordered_paths.insert(insert_after_index, created_path_string.clone());

    let reorder_result = reorder_files_internal(&root, &ordered_paths)?;
    let created_final_path = reorder_result
        .path_map
        .iter()
        .find(|mapping| mapping.old_path == created_path_string)
        .map(|mapping| mapping.new_path.clone())
        .ok_or_else(|| "Created file mapping not found after reorder.".to_string())?;

    Ok(CreateAndInsertResult {
        files: reorder_result.files,
        path_map: reorder_result.path_map,
        created_path: created_final_path,
    })
}

#[tauri::command]
fn load_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_app_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let raw = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_project,
            save_project,
            create_file,
            create_and_insert_file,
            delete_file,
            rename_file,
            reorder_files,
            load_app_settings,
            save_app_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

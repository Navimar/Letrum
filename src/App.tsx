import { invoke } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { buildManuscriptDocument, splitManuscript } from "./lib/manuscript";
import type {
  AppSettings,
  CreateAndInsertResult,
  ManuscriptSegment,
  ProjectFile,
  ProjectMetadata,
  ReorderResult,
  SaveResult,
} from "./lib/types";

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function formatError(error: unknown): string {
  if (!isTauriRuntimeAvailable()) {
    return "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown error.";
}

function countStats(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();

  return {
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
    chars: normalized.length,
  };
}

const numberFormatter = new Intl.NumberFormat();
const emptyProjectMetadata: ProjectMetadata = { scenes: {} };

function formatCount(value: number): string {
  return numberFormatter.format(value);
}

function formatFolderLabel(path: string): string {
  if (!path.trim()) {
    return "No folder loaded";
  }

  const normalized = path.replace(/\/+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1];
  return name ? `${name} - ${path}` : path;
}

function filesAreEqual(left: ProjectFile[], right: ProjectFile[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftFile, index) => {
    const rightFile = right[index];
    return (
      rightFile &&
      leftFile.path === rightFile.path &&
      leftFile.relativePath === rightFile.relativePath &&
      leftFile.content === rightFile.content
    );
  });
}

function metadataAreEqual(
  left: ProjectMetadata,
  right: ProjectMetadata,
): boolean {
  return JSON.stringify(left.scenes) === JSON.stringify(right.scenes);
}

function reconcileSelectedPaths(
  currentSelection: string[],
  previousFiles: ProjectFile[],
  nextFiles: ProjectFile[],
): string[] {
  const nextPathSet = new Set(nextFiles.map((file) => file.path));
  const allFilesWereSelected =
    previousFiles.length > 0 &&
    previousFiles.every((file) => currentSelection.includes(file.path));

  if (allFilesWereSelected) {
    return nextFiles.map((file) => file.path);
  }

  return currentSelection.filter((path) => nextPathSet.has(path));
}

export function App() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [manuscript, setManuscript] = useState("");
  const [metadata, setMetadata] = useState<ProjectMetadata>(emptyProjectMetadata);
  const [segments, setSegments] = useState<ManuscriptSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastFocusedIndex, setLastFocusedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [activeSegmentPath, setActiveSegmentPath] = useState<string | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const externalRefreshInFlightRef = useRef(false);
  const metadataSaveInFlightRef = useRef(0);
  const folderPathRef = useRef(folderPath);
  const filesRef = useRef(files);
  const selectedPathsRef = useRef(selectedPaths);
  const metadataRef = useRef(metadata);
  const dirtyRef = useRef(false);
  const loadingRef = useRef(loading);
  const savingRef = useRef(saving);
  const pointerDragSourceRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const openFolderDialogRef = useRef<() => void>(() => {});
  const saveSelectedRef = useRef<() => void>(() => {});

  const manuscriptDocument = useMemo(
    () => buildManuscriptDocument(files, selectedPaths),
    [files, selectedPaths],
  );
  const totalText = useMemo(
    () => files.map((file) => file.content).join("\n"),
    [files],
  );
  const savePayload = useMemo(
    () => splitManuscript(manuscript, segments),
    [manuscript, segments],
  );
  const selectedText = useMemo(
    () => savePayload.map((file) => file.content).join("\n"),
    [savePayload],
  );
  const activeStats = useMemo(
    () => countStats(selectedPaths.length > 0 ? selectedText : totalText),
    [selectedPaths.length, selectedText, totalText],
  );
  const dirty = savePayload.some((item) => {
    const file = files.find((currentFile) => currentFile.path === item.path);
    return !file || file.content !== item.content;
  });
  const saveStateLabel = loading
    ? "Loading..."
    : saving
      ? "Saving..."
      : dirty
        ? "Unsaved"
        : "Saved";

  useEffect(() => {
    folderPathRef.current = folderPath;
    filesRef.current = files;
    selectedPathsRef.current = selectedPaths;
    metadataRef.current = metadata;
    dirtyRef.current = dirty;
    loadingRef.current = loading;
    savingRef.current = saving;
  });

  function alertError(message: string) {
    window.alert(message);
  }

  function persistProjectMetadata(nextMetadata: ProjectMetadata, nextFolderPath = folderPath) {
    if (!isTauriRuntimeAvailable() || !nextFolderPath.trim()) {
      return;
    }

    metadataSaveInFlightRef.current += 1;

    void invoke("save_project_metadata", {
      folderPath: nextFolderPath.trim(),
      metadata: nextMetadata,
    }).catch((error) => {
      alertError(`Metadata save failed: ${formatError(error)}`);
    }).finally(() => {
      metadataSaveInFlightRef.current = Math.max(
        0,
        metadataSaveInFlightRef.current - 1,
      );
    });
  }

  function metadataForFiles(
    nextMetadata: ProjectMetadata,
    nextFiles: ProjectFile[],
  ): ProjectMetadata {
    const nextScenes: ProjectMetadata["scenes"] = {};
    const validPaths = new Set(nextFiles.map((file) => file.relativePath));

    for (const [relativePath, sceneMetadata] of Object.entries(nextMetadata.scenes)) {
      if (validPaths.has(relativePath)) {
        nextScenes[relativePath] = sceneMetadata;
      }
    }

    return { scenes: nextScenes };
  }

  function remapMetadata(
    currentMetadata: ProjectMetadata,
    currentFiles: ProjectFile[],
    nextFiles: ProjectFile[],
    pathMap: { oldPath: string; newPath: string }[],
  ): ProjectMetadata {
    const nextScenes = { ...currentMetadata.scenes };

    for (const mapping of pathMap) {
      const oldFile = currentFiles.find((file) => file.path === mapping.oldPath);
      const newFile = nextFiles.find((file) => file.path === mapping.newPath);

      if (!oldFile || !newFile || oldFile.relativePath === newFile.relativePath) {
        continue;
      }

      const sceneMetadata = nextScenes[oldFile.relativePath];
      delete nextScenes[oldFile.relativePath];

      if (sceneMetadata) {
        nextScenes[newFile.relativePath] = sceneMetadata;
      }
    }

    return metadataForFiles({ scenes: nextScenes }, nextFiles);
  }

  useEffect(() => {
    setManuscript(manuscriptDocument.manuscript);
    setSegments(manuscriptDocument.segments);
  }, [manuscriptDocument]);

  useEffect(() => {
    if (
      activeSegmentPath &&
      !selectedPaths.includes(activeSegmentPath)
    ) {
      setActiveSegmentPath(null);
    }
  }, [activeSegmentPath, selectedPaths]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    void (async () => {
      try {
        const settings = await invoke<AppSettings>("load_app_settings");
        const lastOpenedFolder = settings.lastOpenedFolder?.trim();
        if (lastOpenedFolder) {
          await loadFolder(lastOpenedFolder);
        }
      } catch {
        // Ignore settings load failures and let the app continue.
      }
    })();
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (!pointerDragSourceRef.current) {
        return;
      }

      const sourcePath = pointerDragSourceRef.current;
      const insertionIndex = dropIndex;
      pointerDragSourceRef.current = null;
      setDropIndex(null);

      if (insertionIndex === null) {
        suppressClickRef.current = false;
        return;
      }

      suppressClickRef.current = true;
      void reorderFiles(sourcePath, insertionIndex);

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dropIndex, files, selectedPaths, folderPath, manuscript, dirty, segments]);

  async function saveSelected(): Promise<boolean> {
    if (!isTauriRuntimeAvailable()) {
      alertError(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return false;
    }

    if (selectedPaths.length === 0) {
      return true;
    }

    setSaving(true);

    try {
      const payload = savePayload;
      const result = await invoke<SaveResult>("save_project", {
        folderPath: folderPath.trim(),
        files: payload,
      });

      const previousFiles = files;
      const nextFiles = previousFiles.map((file) => {
          const mappedPath =
            result.pathMap.find((item) => item.oldPath === file.path)?.newPath ??
            file.path;
          const updated = result.files.find((item) => item.path === mappedPath);
          return updated ?? file;
      });
      const nextMetadata = remapMetadata(
        metadata,
        previousFiles,
        nextFiles,
        result.pathMap,
      );

      setFiles(nextFiles);
      setMetadata(nextMetadata);
      if (result.pathMap.length > 0) {
        persistProjectMetadata(nextMetadata);
      }
      setSelectedPaths((current) =>
        current.map(
          (path) =>
            result.pathMap.find((item) => item.oldPath === path)?.newPath ?? path,
        ),
      );
      setSegments((current) =>
        current.map((segment) => {
          const mappedPath =
            result.pathMap.find((item) => item.oldPath === segment.path)?.newPath ??
            segment.path;
          const updatedFile = result.files.find((file) => file.path === mappedPath);

          return updatedFile
            ? {
                ...segment,
                path: updatedFile.path,
                relativePath: updatedFile.relativePath,
              }
            : segment;
        }),
      );
      setActiveSegmentPath((current) =>
        current
          ? result.pathMap.find((item) => item.oldPath === current)?.newPath ?? current
          : null,
      );
      return true;
    } catch (error) {
      alertError(`Save failed: ${formatError(error)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedIfNeeded(): Promise<boolean> {
    if (!dirty || selectedPaths.length === 0) {
      return true;
    }

    if (saveInFlightRef.current) {
      return saveInFlightRef.current;
    }

    const savePromise = saveSelected();
    saveInFlightRef.current = savePromise;

    try {
      return await savePromise;
    } finally {
      saveInFlightRef.current = null;
    }
  }

  async function loadFolder(nextFolderPath: string) {
    if (!isTauriRuntimeAvailable()) {
      alertError(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    const trimmedFolderPath = nextFolderPath.trim();

    if (!trimmedFolderPath) {
      return;
    }

    const saved = await saveSelectedIfNeeded();
    if (!saved) {
      return;
    }

    setLoading(true);

    try {
      const loadedFiles = await invoke<ProjectFile[]>("load_project", {
        folderPath: trimmedFolderPath,
      });
      const loadedMetadata = await invoke<ProjectMetadata>("load_project_metadata", {
        folderPath: trimmedFolderPath,
      });
      await invoke("save_app_settings", {
        settings: { lastOpenedFolder: trimmedFolderPath },
      });
      setFolderPath(trimmedFolderPath);
      setFiles(loadedFiles);
      setMetadata(metadataForFiles(loadedMetadata, loadedFiles));
      setSelectedPaths(loadedFiles.map((file) => file.path));
      setLastFocusedIndex(loadedFiles.length > 0 ? 0 : null);
    } catch (error) {
      alertError(`Load failed: ${formatError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function refreshProjectFromDisk() {
    if (
      !isTauriRuntimeAvailable() ||
      externalRefreshInFlightRef.current ||
      !folderPathRef.current.trim() ||
      dirtyRef.current ||
      loadingRef.current ||
      savingRef.current ||
      metadataSaveInFlightRef.current > 0
    ) {
      return;
    }

    externalRefreshInFlightRef.current = true;

    try {
      const currentFolderPath = folderPathRef.current.trim();
      const loadedFiles = await invoke<ProjectFile[]>("load_project", {
        folderPath: currentFolderPath,
      });
      const loadedMetadata = await invoke<ProjectMetadata>("load_project_metadata", {
        folderPath: currentFolderPath,
      });
      const nextMetadata = metadataForFiles(loadedMetadata, loadedFiles);
      const currentFiles = filesRef.current;
      const currentMetadata = metadataRef.current;

      if (
        filesAreEqual(currentFiles, loadedFiles) &&
        metadataAreEqual(currentMetadata, nextMetadata)
      ) {
        return;
      }

      const nextSelectedPaths = reconcileSelectedPaths(
        selectedPathsRef.current,
        currentFiles,
        loadedFiles,
      );
      const nextSelectedPathSet = new Set(nextSelectedPaths);

      setFiles(loadedFiles);
      setMetadata(nextMetadata);
      setSelectedPaths(nextSelectedPaths);
      const nextFocusedIndex = loadedFiles.findIndex((file) =>
        nextSelectedPathSet.has(file.path),
      );
      setLastFocusedIndex(nextFocusedIndex >= 0 ? nextFocusedIndex : null);
      setActiveSegmentPath((current) =>
        current && loadedFiles.some((file) => file.path === current)
          ? current
          : null,
      );
    } catch {
      // External refresh is opportunistic. Explicit load/save actions still alert.
    } finally {
      externalRefreshInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    const refresh = () => {
      void refreshProjectFromDisk();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    refresh();
    const intervalId = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function openFolderDialog() {
    if (!isTauriRuntimeAvailable()) {
      alertError(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    try {
      const selected = await open({
        title: "Open Manuscript Folder",
        directory: true,
        multiple: false,
        defaultPath: folderPath.trim() || undefined,
      });

      if (typeof selected !== "string") {
        return;
      }

      await loadFolder(selected);
    } catch (error) {
      alertError(`Folder selection failed: ${formatError(error)}`);
    }
  }

  async function applySelection(
    nextSelection: string[],
    focusedIndex: number | null,
  ) {
    const saved = await saveSelectedIfNeeded();
    if (!saved) {
      return;
    }

    setSelectedPaths(nextSelection);
    setLastFocusedIndex(focusedIndex);
  }

  function selectAll() {
    void applySelection(
      files.map((file) => file.path),
      files.length > 0 ? 0 : null,
    );
  }

  async function createFile() {
    if (!isTauriRuntimeAvailable()) {
      alertError(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    if (!folderPath.trim()) {
      alertError("Load a folder before creating files.");
      return;
    }

    const saved = await saveSelectedIfNeeded();
    if (!saved) {
      return;
    }

    try {
      const result = await invoke<CreateAndInsertResult>("create_and_insert_file", {
        payload: {
          folderPath: folderPath.trim(),
          orderedPaths: files.map((file) => file.path),
          selectedPaths,
        },
      });

      const focusedIndex = result.files.findIndex(
        (file) => file.path === result.createdPath,
      );
      const nextMetadata = remapMetadata(
        metadata,
        files,
        result.files,
        result.pathMap,
      );

      setFiles(result.files);
      setMetadata(nextMetadata);
      if (result.pathMap.length > 0) {
        persistProjectMetadata(nextMetadata);
      }
      setSelectedPaths([result.createdPath]);
      setLastFocusedIndex(focusedIndex);
    } catch (error) {
      alertError(`Create failed: ${formatError(error)}`);
    }
  }

  async function deleteSelected() {
    if (!isTauriRuntimeAvailable()) {
      alertError(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    if (selectedPaths.length === 0) {
      return;
    }

    const confirmed = await confirm(
      `Delete ${selectedPaths.length} selected file(s)?`,
      {
        title: "Delete files",
        kind: "warning",
      },
    );
    if (!confirmed) {
      return;
    }

    const saved = await saveSelectedIfNeeded();
    if (!saved) {
      return;
    }

    try {
      await Promise.all(
        selectedPaths.map((path) =>
          invoke("delete_file", {
            payload: { path },
          }),
        ),
      );

      const nextFiles = files.filter((file) => !selectedPaths.includes(file.path));
      const nextMetadata = metadataForFiles(metadata, nextFiles);

      setFiles(nextFiles);
      setMetadata(nextMetadata);
      persistProjectMetadata(nextMetadata);
      setSelectedPaths([]);
      setLastFocusedIndex(null);
    } catch (error) {
      alertError(`Delete failed: ${formatError(error)}`);
    }
  }

  async function renameFile(path: string, title: string): Promise<boolean> {
    if (!isTauriRuntimeAvailable()) {
      alertError(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return false;
    }

    if (!folderPath.trim()) {
      alertError("Load a folder before renaming files.");
      return false;
    }

    const saved = await saveSelectedIfNeeded();
    if (!saved) {
      return false;
    }

    try {
      const renamedFile = await invoke<ProjectFile>("rename_file", {
        payload: {
          folderPath: folderPath.trim(),
          path,
          title,
        },
      });

      const nextFiles = files.map((file) =>
        file.path === path ? renamedFile : file,
      );
      const nextMetadata = remapMetadata(metadata, files, nextFiles, [
        { oldPath: path, newPath: renamedFile.path },
      ]);

      setFiles(nextFiles);
      setMetadata(nextMetadata);
      persistProjectMetadata(nextMetadata);
      setSelectedPaths((current) =>
        current.map((selectedPath) =>
          selectedPath === path ? renamedFile.path : selectedPath,
        ),
      );
      setActiveSegmentPath((current) =>
        current === path ? renamedFile.path : current,
      );
      return true;
    } catch (error) {
      alertError(`Rename failed: ${formatError(error)}`);
      return false;
    }
  }

  async function reorderFiles(dragSourcePath: string, insertionIndex: number) {
    if (!isTauriRuntimeAvailable()) {
      alertError(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    if (!folderPath.trim()) {
      return;
    }

    const saved = await saveSelectedIfNeeded();
    if (!saved) {
      return;
    }

    const movingPaths =
      selectedPaths.includes(dragSourcePath) && selectedPaths.length > 1
        ? files
            .filter((file) => selectedPaths.includes(file.path))
            .map((file) => file.path)
        : [dragSourcePath];

    const movedFiles = files.filter((file) => movingPaths.includes(file.path));
    const withoutMoved = files.filter((file) => !movingPaths.includes(file.path));

    const sourceFirstIndex = files.findIndex((file) => file.path === movingPaths[0]);
    const movingBeforeInsertion = files
      .slice(0, insertionIndex)
      .filter((file) => movingPaths.includes(file.path)).length;
    const adjustedInsertionIndex = insertionIndex - movingBeforeInsertion;

    if (
      adjustedInsertionIndex < 0 ||
      adjustedInsertionIndex > withoutMoved.length ||
      (movingPaths.length === 1 &&
        sourceFirstIndex !== -1 &&
        (adjustedInsertionIndex === sourceFirstIndex ||
          adjustedInsertionIndex === sourceFirstIndex + 1))
    ) {
      return;
    }

    const reorderedFiles = [
      ...withoutMoved.slice(0, adjustedInsertionIndex),
      ...movedFiles,
      ...withoutMoved.slice(adjustedInsertionIndex),
    ];

    try {
      const result = await invoke<ReorderResult>("reorder_files", {
        payload: {
          folderPath: folderPath.trim(),
          orderedPaths: reorderedFiles.map((file) => file.path),
        },
      });

      const mappedSelection = selectedPaths
        .map(
          (path) =>
            result.pathMap.find((item) => item.oldPath === path)?.newPath ?? path,
        )
        .filter((path) => result.files.some((file) => file.path === path));

      const mappedFocusedPath =
        lastFocusedIndex !== null ? files[lastFocusedIndex]?.path : null;
      const nextFocusedPath =
        mappedFocusedPath === null
          ? null
          : result.pathMap.find((item) => item.oldPath === mappedFocusedPath)?.newPath ??
            mappedFocusedPath;
      const nextFocusedIndex =
        nextFocusedPath === null
          ? null
          : result.files.findIndex((file) => file.path === nextFocusedPath);
      const nextMetadata = remapMetadata(
        metadata,
        files,
        result.files,
        result.pathMap,
      );

      setFiles(result.files);
      setMetadata(nextMetadata);
      persistProjectMetadata(nextMetadata);
      setActiveSegmentPath((current) =>
        current
          ? result.pathMap.find((item) => item.oldPath === current)?.newPath ?? current
          : null,
      );
      setSelectedPaths(mappedSelection);
      setLastFocusedIndex(
        typeof nextFocusedIndex === "number" && nextFocusedIndex >= 0
          ? nextFocusedIndex
          : null,
      );
    } catch (error) {
      alertError(`Reorder failed: ${formatError(error)}`);
    }
  }

  function handleRowClick(
    path: string,
    index: number,
    event: React.MouseEvent<HTMLButtonElement>,
  ) {
    if (suppressClickRef.current) {
      event.preventDefault();
      return;
    }

    const commandKey = event.metaKey || event.ctrlKey;

    if (event.shiftKey && lastFocusedIndex !== null) {
      const start = Math.min(lastFocusedIndex, index);
      const end = Math.max(lastFocusedIndex, index);
      const range = files.slice(start, end + 1).map((file) => file.path);
      void applySelection(range, index);
      return;
    }

    if (commandKey) {
      const next = selectedPaths.includes(path)
        ? selectedPaths.filter((item) => item !== path)
        : [...selectedPaths, path];
      void applySelection(next, index);
      return;
    }

    void applySelection([path], index);
  }

  function setSceneEmoji(emoji: string) {
    const targetPaths =
      selectedPaths.length > 0
        ? selectedPaths
        : activeSegmentPath
          ? [activeSegmentPath]
          : [];

    if (targetPaths.length === 0) {
      return;
    }

    const targetRelativePaths = files
      .filter((file) => targetPaths.includes(file.path))
      .map((file) => file.relativePath);
    const nextMetadata: ProjectMetadata = {
      scenes: { ...metadata.scenes },
    };

    for (const relativePath of targetRelativePaths) {
      nextMetadata.scenes[relativePath] = { emoji };
    }

    setMetadata(nextMetadata);
    persistProjectMetadata(nextMetadata);
  }

  useEffect(() => {
    const handleBlur = () => {
      void saveSelectedIfNeeded();
    };

    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
    };
  }, [dirty, manuscript, selectedPaths, files, segments]);

  useEffect(() => {
    openFolderDialogRef.current = () => {
      void openFolderDialog();
    };
    saveSelectedRef.current = () => {
      void saveSelected();
    };
  });

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    const handleOpenFolder = () => openFolderDialogRef.current();
    const handleSave = () => saveSelectedRef.current();

    window.addEventListener("letrum:open-folder", handleOpenFolder);
    window.addEventListener("letrum:save", handleSave);

    void (async () => {
      try {
        const menu = await Menu.new({
          items: [
            {
              text: "File",
              items: [
                {
                  id: "open-folder",
                  text: "Open Folder...",
                  accelerator: "CmdOrCtrl+O",
                  action: () => {
                    window.dispatchEvent(new Event("letrum:open-folder"));
                  },
                },
                { item: "Separator" },
                {
                  id: "save",
                  text: "Save",
                  accelerator: "CmdOrCtrl+S",
                  action: () => {
                    window.dispatchEvent(new Event("letrum:save"));
                  },
                },
                { item: "Separator" },
                { item: "Quit", text: "Quit" },
              ],
            },
            {
              text: "Edit",
              items: [
                { item: "Undo" },
                { item: "Redo" },
                { item: "Separator" },
                { item: "Cut" },
                { item: "Copy" },
                { item: "Paste" },
                { item: "SelectAll" },
              ],
            },
          ],
        });
        await menu.setAsAppMenu();
      } catch (error) {
        alertError(`Menu setup failed: ${formatError(error)}`);
      }
    })();

    return () => {
      window.removeEventListener("letrum:open-folder", handleOpenFolder);
      window.removeEventListener("letrum:save", handleSave);
    };
  }, []);

  return (
    <div className="app-shell">
      <main className="workspace">
        <Sidebar
          files={files}
          selectedPaths={selectedPaths}
          activePath={activeSegmentPath}
          metadata={metadata}
          dropIndex={dropIndex}
          onRowClick={handleRowClick}
          onSelectAll={selectAll}
          onCreateFile={createFile}
          onDeleteSelected={deleteSelected}
          onRenameFile={renameFile}
          onSetSceneEmoji={setSceneEmoji}
          onPointerDragStart={(path) => {
            pointerDragSourceRef.current = path;
            setDropIndex(null);
          }}
          onSetDropIndex={(index) => {
            if (!pointerDragSourceRef.current) {
              return;
            }

            setDropIndex(index);
          }}
          onPointerDragEnd={() => {
            if (!pointerDragSourceRef.current) {
              return;
            }

            const sourcePath = pointerDragSourceRef.current;
            const nextDropIndex = dropIndex;
            pointerDragSourceRef.current = null;
            setDropIndex(null);

            if (nextDropIndex === null) {
              return;
            }

            suppressClickRef.current = true;
            void reorderFiles(sourcePath, nextDropIndex);

            window.setTimeout(() => {
              suppressClickRef.current = false;
            }, 0);
          }}
        />
        <section className="editor-panel">
          <Editor
            value={manuscript}
            segments={segments}
            readOnly={selectedPaths.length === 0}
            onChange={(nextManuscript, nextSegments) => {
              setManuscript(nextManuscript);
              setSegments(nextSegments);
            }}
            onActiveSegmentChange={setActiveSegmentPath}
            blurSignal={selectedPaths.join("\n")}
            onBlur={() => {
              void saveSelectedIfNeeded();
            }}
          />
        </section>
      </main>

      <footer className="statusbar">
        <span className="statusbar__folder" title={folderPath || undefined}>
          {formatFolderLabel(folderPath)}
        </span>
        <div className="statusbar__stats" aria-label="Document statistics">
          <span>
            <strong>{formatCount(activeStats.words)}</strong> words
          </span>
          <span>
            <strong>{formatCount(activeStats.chars)}</strong> chars
          </span>
        </div>
        <span className="statusbar__save-state">{saveStateLabel}</span>
      </footer>
    </div>
  );
}

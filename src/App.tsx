import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { buildManuscript, splitManuscript } from "./lib/manuscript";
import type {
  AppSettings,
  CreateAndInsertResult,
  ProjectFile,
  ReorderResult,
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

export function App() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [manuscript, setManuscript] = useState("");
  const [status, setStatus] = useState("Enter a folder path and load files.");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastFocusedIndex, setLastFocusedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const pointerDragSourceRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);

  const manuscriptText = useMemo(
    () => buildManuscript(files, selectedPaths),
    [files, selectedPaths],
  );
  const selectedFileSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectedText = useMemo(
    () =>
      files
        .filter((file) => selectedFileSet.has(file.path))
        .map((file) => file.content)
        .join("\n"),
    [files, selectedFileSet],
  );
  const totalText = useMemo(
    () => files.map((file) => file.content).join("\n"),
    [files],
  );
  const activeStats = useMemo(
    () => countStats(selectedPaths.length > 0 ? selectedText : totalText),
    [selectedPaths.length, selectedText, totalText],
  );
  const totalStats = useMemo(() => countStats(totalText), [totalText]);
  const dirty = manuscript !== manuscriptText;
  const selectedCount = selectedPaths.length;
  const showingSelectionStats =
    selectedPaths.length > 0 && selectedPaths.length !== files.length;

  useEffect(() => {
    setManuscript(manuscriptText);
  }, [manuscriptText]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    void (async () => {
      try {
        const settings = await invoke<AppSettings>("load_app_settings");
        if (settings.lastOpenedFolder) {
          setFolderPath(settings.lastOpenedFolder);
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
  }, [dropIndex, files, selectedPaths, folderPath, manuscript, dirty]);

  async function saveSelected(): Promise<boolean> {
    if (!isTauriRuntimeAvailable()) {
      setStatus(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return false;
    }

    setSaving(true);
    setStatus("Saving...");

    try {
      const payload = splitManuscript(manuscript, files, selectedPaths);
      await invoke("save_project", { files: payload });

      setFiles((current) =>
        current.map((file) => {
          const updated = payload.find((item) => item.path === file.path);
          return updated ? { ...file, content: updated.content } : file;
        }),
      );
      setStatus(`Saved ${payload.length} files.`);
      return true;
    } catch (error) {
      setStatus(`Save failed: ${formatError(error)}`);
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

  async function loadFolder() {
    if (!isTauriRuntimeAvailable()) {
      setStatus(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    if (!folderPath.trim()) {
      setStatus("Enter a folder path first.");
      return;
    }

    const saved = await saveSelectedIfNeeded();
    if (!saved) {
      return;
    }

    setLoading(true);
    setStatus("Loading files...");

    try {
      const loadedFiles = await invoke<ProjectFile[]>("load_project", {
        folderPath: folderPath.trim(),
      });
      await invoke("save_app_settings", {
        settings: { lastOpenedFolder: folderPath.trim() },
      });
      setFiles(loadedFiles);
      setSelectedPaths(loadedFiles.map((file) => file.path));
      setLastFocusedIndex(loadedFiles.length > 0 ? 0 : null);
      setStatus(`Loaded ${loadedFiles.length} files.`);
    } catch (error) {
      setStatus(`Load failed: ${formatError(error)}`);
    } finally {
      setLoading(false);
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

  function clearSelection() {
    void applySelection([], null);
  }

  async function createFile() {
    if (!isTauriRuntimeAvailable()) {
      setStatus(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    if (!folderPath.trim()) {
      setStatus("Load a folder before creating files.");
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

      setFiles(result.files);
      setSelectedPaths([result.createdPath]);
      setLastFocusedIndex(focusedIndex);
      setStatus(
        `Created ${
          result.files.find((file) => file.path === result.createdPath)
            ?.relativePath ?? result.createdPath
        }.`,
      );
    } catch (error) {
      setStatus(`Create failed: ${formatError(error)}`);
    }
  }

  async function deleteSelected() {
    if (!isTauriRuntimeAvailable()) {
      setStatus(
        "Tauri runtime is not available. Start the app with `npm run tauri dev`, not `npm run dev`.",
      );
      return;
    }

    if (selectedPaths.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedPaths.length} selected file(s)?`,
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

      setFiles((current) =>
        current.filter((file) => !selectedPaths.includes(file.path)),
      );
      setSelectedPaths([]);
      setLastFocusedIndex(null);
      setStatus(`Deleted ${selectedPaths.length} files.`);
    } catch (error) {
      setStatus(`Delete failed: ${formatError(error)}`);
    }
  }

  async function reorderFiles(dragSourcePath: string, insertionIndex: number) {
    if (!isTauriRuntimeAvailable()) {
      setStatus(
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

      setFiles(result.files);
      setSelectedPaths(mappedSelection);
      setLastFocusedIndex(
        typeof nextFocusedIndex === "number" && nextFocusedIndex >= 0
          ? nextFocusedIndex
          : null,
      );
      setStatus(`Reordered ${movingPaths.length} file(s).`);
    } catch (error) {
      setStatus(`Reorder failed: ${formatError(error)}`);
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

  useEffect(() => {
    const handleBlur = () => {
      void saveSelectedIfNeeded();
    };

    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
    };
  }, [dirty, manuscript, selectedPaths, files]);

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="toolbar__path">
          <label htmlFor="folderPath">Folder</label>
          <input
            id="folderPath"
            value={folderPath}
            onChange={(event) => setFolderPath(event.target.value)}
            placeholder="/absolute/path/to/manuscript"
          />
        </div>
        <button type="button" onClick={loadFolder} disabled={loading}>
          Load Folder
        </button>
        <button type="button" onClick={selectAll} disabled={files.length === 0}>
          Select All
        </button>
        <button
          type="button"
          onClick={() => {
            void saveSelected();
          }}
          disabled={saving || selectedPaths.length === 0}
        >
          Save
        </button>
        <div className="toolbar__meta">
          <span>{selectedCount} selected</span>
          <span>
            {showingSelectionStats ? "Selection" : "Project"}: {activeStats.words} words,{" "}
            {activeStats.chars} chars
          </span>
          {showingSelectionStats ? (
            <span>
              Total: {totalStats.words} words, {totalStats.chars} chars
            </span>
          ) : null}
          <span>{dirty ? "Unsaved changes" : "Saved"}</span>
          <span>{status}</span>
        </div>
      </header>

      <main className="workspace">
        <Sidebar
          files={files}
          selectedPaths={selectedPaths}
          dropIndex={dropIndex}
          onRowClick={handleRowClick}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onCreateFile={createFile}
          onDeleteSelected={deleteSelected}
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
            readOnly={selectedPaths.length === 0}
            onChange={setManuscript}
            blurSignal={selectedPaths.join("\n")}
            onBlur={() => {
              void saveSelectedIfNeeded();
            }}
          />
        </section>
      </main>
    </div>
  );
}

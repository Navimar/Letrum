import { useRef, useState } from "react";
import { fileTitleFor } from "../lib/manuscript";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";
import type { ProjectFile } from "../lib/types";

type SidebarProps = {
  files: ProjectFile[];
  selectedPaths: string[];
  activePath: string | null;
  dropIndex: number | null;
  onRowClick: (
    path: string,
    index: number,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  onSelectAll: () => void;
  onCreateFile: () => void;
  onDeleteSelected: () => void;
  onRenameFile: (path: string, title: string) => Promise<boolean>;
  onPointerDragStart: (path: string) => void;
  onPointerDragEnd: () => void;
  onSetDropIndex: (index: number) => void;
};

export function Sidebar({
  files,
  selectedPaths,
  activePath,
  dropIndex,
  onRowClick,
  onSelectAll,
  onCreateFile,
  onDeleteSelected,
  onRenameFile,
  onPointerDragStart,
  onPointerDragEnd,
  onSetDropIndex,
}: SidebarProps) {
  const selectedSet = new Set(selectedPaths);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const skipNextSubmitRef = useRef(false);
  const submittingRef = useRef(false);

  function startEditing(file: ProjectFile) {
    setEditingPath(file.path);
    setDraftTitle(fileTitleFor(file.relativePath));
  }

  function cancelEditing() {
    setEditingPath(null);
    setDraftTitle("");
  }

  async function submitEditing(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (skipNextSubmitRef.current) {
      skipNextSubmitRef.current = false;
      return;
    }

    if (!editingPath) {
      return;
    }

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    try {
      const renamed = await onRenameFile(editingPath, draftTitle);
      if (renamed) {
        cancelEditing();
      }
    } finally {
      submittingRef.current = false;
    }
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      skipNextSubmitRef.current = true;
      cancelEditing();
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sidebar__actions">
          <button type="button" onClick={onSelectAll} title="Select all" aria-label="Select all">
            📚
          </button>
          <button type="button" onClick={onCreateFile} title="New file" aria-label="New file">
            ➕
          </button>
          <button
            type="button"
            className="sidebar__action--danger"
            onClick={onDeleteSelected}
            disabled={selectedPaths.length === 0}
            title="Delete selected"
            aria-label="Delete selected"
          >
            🗑️
          </button>
        </div>
      </div>
      <div className="sidebar__list">
        <div
          className={`drop-slot${dropIndex === 0 ? " drop-slot--active" : ""}`}
          onMouseEnter={() => onSetDropIndex(0)}
        />
        {files.map((file, index) => (
          <div key={file.path} className="file-entry">
            {editingPath === file.path ? (
              <form className="file-row file-row--editing" onSubmit={submitEditing}>
                <input
                  value={draftTitle}
                  autoFocus
                  onBlur={() => {
                    void submitEditing();
                  }}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={handleEditKeyDown}
                />
              </form>
            ) : (
              <button
                type="button"
                className={`file-row${selectedSet.has(file.path) ? " file-row--selected" : ""}${activePath === file.path ? " file-row--active" : ""}`}
                onClick={(event) => onRowClick(file.path, index, event)}
                onDoubleClick={() => startEditing(file)}
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  onPointerDragStart(file.path);
                }}
                onMouseUp={() => onPointerDragEnd()}
                title={file.relativePath}
              >
                <span>{fileTitleFor(file.relativePath)}</span>
              </button>
            )}
            <div
              className={`drop-slot${dropIndex === index + 1 ? " drop-slot--active" : ""}`}
              onMouseEnter={() => onSetDropIndex(index + 1)}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}

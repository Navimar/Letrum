import type { MouseEvent } from "react";
import type { ProjectFile } from "../lib/types";

type SidebarProps = {
  files: ProjectFile[];
  selectedPaths: string[];
  dropIndex: number | null;
  onRowClick: (
    path: string,
    index: number,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onCreateFile: () => void;
  onDeleteSelected: () => void;
  onPointerDragStart: (path: string) => void;
  onPointerDragEnd: () => void;
  onSetDropIndex: (index: number) => void;
};

export function Sidebar({
  files,
  selectedPaths,
  dropIndex,
  onRowClick,
  onSelectAll,
  onClearSelection,
  onCreateFile,
  onDeleteSelected,
  onPointerDragStart,
  onPointerDragEnd,
  onSetDropIndex,
}: SidebarProps) {
  const selectedSet = new Set(selectedPaths);

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h2>Files</h2>
        <div className="sidebar__actions">
          <button type="button" onClick={onCreateFile}>
            New File
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedPaths.length === 0}
          >
            Delete
          </button>
          <button type="button" onClick={onSelectAll}>
            Select All
          </button>
          <button type="button" onClick={onClearSelection}>
            Clear
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
            <button
              type="button"
              className={`file-row${selectedSet.has(file.path) ? " file-row--selected" : ""}`}
              onClick={(event) => onRowClick(file.path, index, event)}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                onPointerDragStart(file.path);
              }}
              onMouseUp={() => onPointerDragEnd()}
              title={file.relativePath}
            >
              <span>{file.relativePath}</span>
            </button>
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

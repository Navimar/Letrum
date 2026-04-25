import {
  baseKeymap,
  newlineInCode,
} from "prosemirror-commands";
import {
  history,
  redo,
  undo,
} from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  Node as ProseMirrorNode,
  Schema,
  type DOMOutputSpec,
} from "prosemirror-model";
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Command,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  Decoration,
  DecorationSet,
} from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { fileTitleFor } from "../lib/manuscript";
import type { ManuscriptSegment } from "../lib/types";

type EditorProps = {
  value: string;
  segments: ManuscriptSegment[];
  readOnly?: boolean;
  onChange: (value: string, segments: ManuscriptSegment[]) => void;
  onActiveSegmentChange?: (path: string | null) => void;
  onBlur?: () => void;
  blurSignal?: string;
};

type SerializedDocument = {
  value: string;
  segments: ManuscriptSegment[];
};

type SearchMatch = {
  from: number;
  to: number;
};

type SearchState = {
  matches: SearchMatch[];
  activeIndex: number;
};

export type SelectionExtraction = {
  sourcePath: string;
  fromOffset: number;
  toOffset: number;
  text: string;
};

export type EditorHandle = {
  getSelectionExtraction: () => SelectionExtraction | null;
};

const manuscriptSchema = new Schema({
  nodes: {
    doc: {
      content: "file_segment*",
    },
    text: {
      group: "inline",
    },
    file_segment: {
      attrs: {
        path: { default: "" },
        relativePath: { default: "" },
      },
      code: true,
      content: "text*",
      defining: true,
      group: "block",
      isolating: true,
      marks: "",
      toDOM(node): DOMOutputSpec {
        const relativePath = String(node.attrs.relativePath ?? "");

        return [
          "section",
          {
            class: "manuscript-segment",
            "data-file-segment": "true",
            "data-path": String(node.attrs.path ?? ""),
          },
          [
            "div",
            { class: "manuscript-marker", contenteditable: "false" },
            ["div", { class: "manuscript-marker__line" }],
            ["div", { class: "manuscript-marker__label" }, fileTitleFor(relativePath)],
            ["div", { class: "manuscript-marker__line" }],
          ],
          ["div", { class: "manuscript-segment__content" }, 0],
        ];
      },
      parseDOM: [
        {
          tag: "section[data-file-segment]",
          getAttrs(dom) {
            if (!(dom instanceof HTMLElement)) {
              return false;
            }

            return {
              path: dom.dataset.path ?? "",
              relativePath: dom.dataset.relativePath ?? "",
            };
          },
        },
      ],
    },
  },
  marks: {},
});

const searchPluginKey = new PluginKey<SearchState>("search");

const searchHighlight = new Plugin<SearchState>({
  key: searchPluginKey,
  state: {
    init() {
      return { matches: [], activeIndex: -1 };
    },
    apply(transaction, previous) {
      return transaction.getMeta(searchPluginKey) ?? previous;
    },
  },
  props: {
    decorations(state) {
      const searchState = searchPluginKey.getState(state);

      if (!searchState || searchState.matches.length === 0) {
        return DecorationSet.empty;
      }

      return DecorationSet.create(
        state.doc,
        searchState.matches.map((match, index) =>
          Decoration.inline(match.from, match.to, {
            class:
              index === searchState.activeIndex
                ? "editor-search-match editor-search-match--active"
                : "editor-search-match",
          }),
        ),
      );
    },
  },
});

function findSearchMatches(doc: ProseMirrorNode, query: string): SearchMatch[] {
  const needle = query.toLocaleLowerCase();

  if (!needle) {
    return [];
  }

  const matches: SearchMatch[] = [];

  doc.descendants((node, position) => {
    if (node.type !== manuscriptSchema.nodes.file_segment) {
      return true;
    }

    const haystack = node.textContent.toLocaleLowerCase();
    let index = haystack.indexOf(needle);

    while (index !== -1) {
      const from = position + 1 + index;
      matches.push({
        from,
        to: from + query.length,
      });
      index = haystack.indexOf(needle, index + needle.length);
    }

    return false;
  });

  return matches;
}

function normalizeSearchIndex(index: number, matchCount: number) {
  if (matchCount === 0) {
    return -1;
  }

  return ((index % matchCount) + matchCount) % matchCount;
}

function scrollPositionIntoEditorView(view: EditorView, position: number) {
  window.requestAnimationFrame(() => {
    const editorRect = view.dom.getBoundingClientRect();
    const positionRect = view.coordsAtPos(position);
    const targetTop =
      positionRect.top - editorRect.top + view.dom.scrollTop - view.dom.clientHeight * 0.35;

    view.dom.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  });
}

function updateSearch(
  view: EditorView,
  query: string,
  activeIndex: number,
  selectActive: boolean,
) {
  const matches = findSearchMatches(view.state.doc, query);
  const normalizedIndex = normalizeSearchIndex(activeIndex, matches.length);
  const activeMatch = matches[normalizedIndex];
  let transaction = view.state.tr.setMeta(searchPluginKey, {
    matches,
    activeIndex: normalizedIndex,
  });

  if (selectActive && activeMatch) {
    transaction = transaction
      .setSelection(TextSelection.create(view.state.doc, activeMatch.from, activeMatch.to))
      .scrollIntoView();
  }

  view.dispatch(transaction);
  if (selectActive && activeMatch) {
    scrollPositionIntoEditorView(view, activeMatch.from);
  }
  return matches.length;
}

function createFileSegment(segment: ManuscriptSegment, content: string) {
  const textNode = content.length > 0 ? manuscriptSchema.text(content) : null;

  return manuscriptSchema.nodes.file_segment.create(
    {
      path: segment.path,
      relativePath: segment.relativePath,
    },
    textNode,
  );
}

function createEditorDoc(
  value: string,
  segments: readonly ManuscriptSegment[],
): ProseMirrorNode {
  return manuscriptSchema.nodes.doc.create(
    null,
    segments.map((segment) =>
      createFileSegment(segment, value.slice(segment.from, segment.to)),
    ),
  );
}

function serializeEditorDoc(doc: ProseMirrorNode): SerializedDocument {
  const parts: string[] = [];
  const segments: ManuscriptSegment[] = [];
  let position = 0;

  doc.forEach((node) => {
    if (node.type !== manuscriptSchema.nodes.file_segment) {
      return;
    }

    const content = node.textContent;
    const from = position;
    parts.push(content);
    position += content.length;
    segments.push({
      path: String(node.attrs.path ?? ""),
      relativePath: String(node.attrs.relativePath ?? ""),
      from,
      to: position,
    });
  });

  return {
    value: parts.join(""),
    segments,
  };
}

function sameSegments(
  left: readonly ManuscriptSegment[],
  right: readonly ManuscriptSegment[],
): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => {
      const other = right[index];
      return (
        other &&
        segment.path === other.path &&
        segment.relativePath === other.relativePath &&
        segment.from === other.from &&
        segment.to === other.to
      );
    })
  );
}

function sameDocument(
  doc: ProseMirrorNode,
  value: string,
  segments: readonly ManuscriptSegment[],
): boolean {
  const serialized = serializeEditorDoc(doc);
  return serialized.value === value && sameSegments(serialized.segments, segments);
}

function segmentOrder(doc: ProseMirrorNode): string[] {
  const paths: string[] = [];

  doc.forEach((node) => {
    if (node.type === manuscriptSchema.nodes.file_segment) {
      paths.push(String(node.attrs.path ?? ""));
    }
  });

  return paths;
}

function sameSegmentOrder(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function activeSegmentPath(state: EditorState): string | null {
  const cursorPosition = state.selection.from;
  let activePath: string | null = null;

  state.doc.forEach((node, offset) => {
    if (activePath || node.type !== manuscriptSchema.nodes.file_segment) {
      return;
    }

    const from = offset + 1;
    const to = offset + node.nodeSize - 1;

    if (cursorPosition >= from && cursorPosition <= to) {
      activePath = String(node.attrs.path ?? "");
    }
  });

  return activePath;
}

function selectionExtraction(state: EditorState): SelectionExtraction | null {
  const selection = state.selection;

  if (selection.empty || !(selection instanceof TextSelection)) {
    return null;
  }

  const fromPosition = selection.$from;
  const toPosition = selection.$to;

  if (
    fromPosition.depth === 0 ||
    toPosition.depth === 0 ||
    fromPosition.node(fromPosition.depth) !== toPosition.node(toPosition.depth)
  ) {
    return null;
  }

  const segment = fromPosition.node(fromPosition.depth);
  if (segment.type !== manuscriptSchema.nodes.file_segment) {
    return null;
  }

  const fromOffset = fromPosition.parentOffset;
  const toOffset = toPosition.parentOffset;
  const text = segment.textContent.slice(fromOffset, toOffset);

  if (!text) {
    return null;
  }

  return {
    sourcePath: String(segment.attrs.path ?? ""),
    fromOffset,
    toOffset,
    text,
  };
}

const keepSegmentStructure = new Plugin({
  filterTransaction(transaction, state) {
    if (!transaction.docChanged) {
      return true;
    }

    return sameSegmentOrder(segmentOrder(state.doc), segmentOrder(transaction.doc));
  },
});

const inlineSelectionHighlight = new Plugin({
  props: {
    decorations(state) {
      if (state.selection.empty) {
        return DecorationSet.empty;
      }

      const decorations: Decoration[] = [];

      for (const range of state.selection.ranges) {
        state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, position) => {
          if (!node.isText) {
            return;
          }

          const from = Math.max(range.$from.pos, position);
          const to = Math.min(range.$to.pos, position + node.nodeSize);

          if (from < to) {
            decorations.push(
              Decoration.inline(from, to, {
                class: "editor-selection-highlight",
              }),
            );
          }
        });
      }

      return DecorationSet.create(state.doc, decorations);
    },
  },
});

const preventBoundaryBackspace: Command = (state) => {
  const selection = state.selection;

  if (!selection.empty || !(selection instanceof TextSelection)) {
    return false;
  }

  return selection.$from.parentOffset === 0;
};

const preventBoundaryDelete: Command = (state) => {
  const selection = state.selection;

  if (!selection.empty || !(selection instanceof TextSelection)) {
    return false;
  }

  return selection.$from.parentOffset === selection.$from.parent.content.size;
};

const selectWholeManuscript: Command = (state, dispatch) => {
  const firstSegment = state.doc.firstChild;
  const lastSegment = state.doc.lastChild;

  if (!firstSegment || !lastSegment) {
    return true;
  }

  const from = 1;
  const to = state.doc.content.size - 1;
  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  return true;
};

function createEditorState(value: string, segments: readonly ManuscriptSegment[]) {
  return EditorState.create({
    doc: createEditorDoc(value, segments),
    plugins: [
      keepSegmentStructure,
      inlineSelectionHighlight,
      searchHighlight,
      history(),
      keymap({
        Enter: newlineInCode,
        Backspace: preventBoundaryBackspace,
        Delete: preventBoundaryDelete,
        "Mod-z": undo,
        "Shift-Mod-z": redo,
        "Mod-y": redo,
        "Mod-a": selectWholeManuscript,
      }),
      keymap(baseKeymap),
    ],
    schema: manuscriptSchema,
  });
}

function blurEditor(view: EditorView) {
  view.dom.classList.add("editor--blurred");
  view.dom.blur();

  window.requestAnimationFrame(() => {
    view.dom.blur();
  });
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  value,
  segments,
  readOnly = false,
  onChange,
  onActiveSegmentChange,
  onBlur,
  blurSignal,
}: EditorProps, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  const activeSegmentRef = useRef(onActiveSegmentChange);
  const blurRef = useRef(onBlur);
  const readOnlyRef = useRef(readOnly);
  const searchMatchCountRef = useRef(0);
  const lastSelectionExtractionRef = useRef<SelectionExtraction | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);

  changeRef.current = onChange;
  activeSegmentRef.current = onActiveSegmentChange;
  blurRef.current = onBlur;
  readOnlyRef.current = readOnly;

  useImperativeHandle(ref, () => ({
    getSelectionExtraction() {
      const view = viewRef.current;
      return view
        ? selectionExtraction(view.state) ?? lastSelectionExtractionRef.current
        : lastSelectionExtractionRef.current;
    },
  }), []);

  function focusSearchInput() {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }

  function openSearch() {
    setSearchOpen(true);
    focusSearchInput();
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchMatchCount(0);
    searchMatchCountRef.current = 0;

    const view = viewRef.current;
    if (view) {
      updateSearch(view, "", -1, false);
      view.focus();
    }
  }

  function moveSearch(delta: number) {
    const matchCount = searchMatchCountRef.current;

    if (matchCount === 0) {
      return;
    }

    setSearchActiveIndex((current) =>
      normalizeSearchIndex(current + delta, matchCount),
    );
  }

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let view: EditorView;
    view = new EditorView(containerRef.current, {
      state: createEditorState(value, segments),
      editable: () => !readOnlyRef.current,
      dispatchTransaction(transaction) {
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);

        if (transaction.docChanged) {
          const serialized = serializeEditorDoc(nextState.doc);
          changeRef.current(serialized.value, serialized.segments);
        }

        if (transaction.selectionSet || transaction.docChanged) {
          const extraction = selectionExtraction(nextState);
          if (extraction) {
            lastSelectionExtractionRef.current = extraction;
          } else if (transaction.docChanged) {
            lastSelectionExtractionRef.current = null;
          }

          activeSegmentRef.current?.(activeSegmentPath(nextState));
        }
      },
      handleDOMEvents: {
        focus(currentView) {
          currentView.dom.classList.remove("editor--blurred");
          return false;
        },
        blur(currentView) {
          window.requestAnimationFrame(() => {
            if (!currentView.dom.contains(document.activeElement)) {
              blurRef.current?.();
            }
          });
          return false;
        },
      },
    });

    viewRef.current = view;
    activeSegmentRef.current?.(activeSegmentPath(view.state));

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "f") {
        event.preventDefault();
        openSearch();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "g") {
        event.preventDefault();
        moveSearch(event.shiftKey ? -1 : 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || sameDocument(view.state.doc, value, segments)) {
      return;
    }

    blurEditor(view);
    lastSelectionExtractionRef.current = null;
    const nextState = createEditorState(value, segments);
    view.updateState(nextState);
    activeSegmentRef.current?.(activeSegmentPath(nextState));
  }, [value, segments]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const nextMatchCount = updateSearch(
      view,
      searchOpen ? searchQuery : "",
      searchActiveIndex,
      searchOpen && searchQuery.length > 0,
    );
    searchMatchCountRef.current = nextMatchCount;
    setSearchMatchCount(nextMatchCount);
  }, [searchOpen, searchQuery, searchActiveIndex, value, segments]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.setProps({
      editable: () => !readOnlyRef.current,
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    blurEditor(view);
  }, [blurSignal]);

  const visibleSearchIndex =
    searchMatchCount === 0
      ? 0
      : normalizeSearchIndex(searchActiveIndex, searchMatchCount) + 1;

  return (
    <div className="editor">
      {searchOpen ? (
        <div className="editor-search">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                moveSearch(event.shiftKey ? -1 : 1);
              }

              if (event.key === "Escape") {
                event.preventDefault();
                closeSearch();
              }
            }}
            placeholder="Find"
            aria-label="Find in manuscript"
          />
          <span className="editor-search__count">
            {visibleSearchIndex}/{searchMatchCount}
          </span>
          <button type="button" onClick={() => moveSearch(-1)} aria-label="Previous match">
            ↑
          </button>
          <button type="button" onClick={() => moveSearch(1)} aria-label="Next match">
            ↓
          </button>
          <button type="button" onClick={closeSearch} aria-label="Close search">
            ×
          </button>
        </div>
      ) : null}
      <div className="editor__surface" ref={containerRef} />
    </div>
  );
});

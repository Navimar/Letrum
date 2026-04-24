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
  TextSelection,
  type Command,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  Decoration,
  DecorationSet,
} from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import { useEffect, useRef } from "react";
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
  const position = state.selection.$from;

  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);

    if (node.type === manuscriptSchema.nodes.file_segment) {
      return String(node.attrs.path ?? "");
    }
  }

  return null;
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

export function Editor({
  value,
  segments,
  readOnly = false,
  onChange,
  onActiveSegmentChange,
  onBlur,
  blurSignal,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  const activeSegmentRef = useRef(onActiveSegmentChange);
  const blurRef = useRef(onBlur);
  const readOnlyRef = useRef(readOnly);

  changeRef.current = onChange;
  activeSegmentRef.current = onActiveSegmentChange;
  blurRef.current = onBlur;
  readOnlyRef.current = readOnly;

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
    const view = viewRef.current;
    if (!view || sameDocument(view.state.doc, value, segments)) {
      return;
    }

    blurEditor(view);
    const nextState = createEditorState(value, segments);
    view.updateState(nextState);
    activeSegmentRef.current?.(activeSegmentPath(nextState));
  }, [value, segments]);

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

  return <div className="editor" ref={containerRef} />;
}

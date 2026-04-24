import { history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEffect, useRef } from "react";
import { parseMarker } from "../lib/manuscript";

type EditorProps = {
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  blurSignal?: string;
};

const readOnlyCompartment = new Compartment();

class MarkerWidget extends WidgetType {
  constructor(private readonly label: string) {
    super();
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "manuscript-marker";

    const line = document.createElement("div");
    line.className = "manuscript-marker__line";

    const text = document.createElement("div");
    text.className = "manuscript-marker__label";
    text.textContent = this.label;

    wrapper.append(line, text, line.cloneNode() as HTMLElement);
    return wrapper;
  }
}

const markerDecorations = StateField.define({
  create(state) {
    return buildMarkerDecorations(state);
  },
  update(decorations, transaction) {
    if (!transaction.docChanged) {
      return decorations;
    }

    return buildMarkerDecorations(transaction.state);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

function normalizeSelectionPos(state: EditorState, position: number): number {
  const clamped = Math.max(0, Math.min(position, state.doc.length));
  const line = state.doc.lineAt(clamped);

  if (!parseMarker(line.text)) {
    return clamped;
  }

  return Math.min(line.to + 1, state.doc.length);
}

function buildMarkerDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>();

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const label = parseMarker(line.text);

    if (!label) {
      continue;
    }

    builder.add(
      line.from,
      line.to,
      Decoration.replace({
        widget: new MarkerWidget(label),
        block: true,
      }),
    );
  }

  return builder.finish();
}

export function Editor({
  value,
  readOnly = false,
  onChange,
  onBlur,
  blurSignal,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  const blurRef = useRef(onBlur);

  changeRef.current = onChange;
  blurRef.current = onBlur;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const updateListener = EditorView.updateListener.of(
      (update: ViewUpdate) => {
        if (update.docChanged) {
          changeRef.current(update.state.doc.toString());
        }
      },
    );

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        markdown(),
        oneDark,
        keymap.of(historyKeymap),
        EditorView.lineWrapping,
        markerDecorations,
        EditorView.atomicRanges.of((view) => view.state.field(markerDecorations)),
        updateListener,
        EditorView.domEventHandlers({
          blur: () => {
            blurRef.current?.();
          },
        }),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.contentDOM.blur();
  }, [blurSignal]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return <div className="editor" ref={containerRef} />;
}

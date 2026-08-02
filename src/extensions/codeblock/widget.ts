import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
} from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from "@codemirror/commands";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  WidgetType,
} from "@codemirror/view";
import {
  syntaxTree,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  getAdjacentFencedBlock,
  type CodeBlockOptions,
  getCodeLanguageExtension,
  getFencedBlockByStart,
  getFencedBlockInfo,
  getSelectionForBlockClick,
  renderCodeHtml,
} from './model';
import { highlightCodeHtml } from '../highlight';
import { activeCodeBlockField, setActiveCodeBlock } from './state';
import { githubDarkCodeHighlightStyle } from './highlight-style';
import { nestedEditorTheme } from './theme';
import type { CodeBlockEditorMount, CodeBlockElement, FencedBlockInfo } from './types';
import {
  exitWidgetWithArrowKey,
  focusElementWithoutScroll,
  handleWidgetBoundaryMouseDown,
} from '../../internal/widget-navigation';

function focusNestedEditor(
  mount: CodeBlockEditorMount,
  selection: EditorSelection,
): void {
  mount.view.dispatch({ selection, scrollIntoView: true });
  mount.view.focus();
}

function reconfigureNestedLanguage(
  mount: CodeBlockEditorMount,
  lang: string,
): void {
  mount.currentLang = lang;
  const loadId = mount.languageLoadId + 1;
  mount.languageLoadId = loadId;
  void getCodeLanguageExtension(mount.codeLanguages, lang).then((extension) => {
    if (mount.isDestroyed || mount.languageLoadId !== loadId) return;
    mount.view.dispatch({
      effects: mount.langCompartment.reconfigure(extension),
    });
  });
}

function focusCodeBlockLanguage(wrapper: HTMLElement): boolean {
  const langInput = wrapper.querySelector(
    ".me-codeblock-lang-input",
  ) as HTMLInputElement | null;
  if (!langInput) return false;
  focusElementWithoutScroll(langInput);
  langInput.setSelectionRange(langInput.value.length, langInput.value.length);
  return true;
}

function normalizeRenderedCodeBlock(body: HTMLElement): void {
  const pre = body.querySelector("pre");
  if (!pre) return;

  pre.style.margin = "0";
  pre.style.padding = "0";
  pre.style.background = "transparent";
  pre.style.fontFamily = "inherit";
  pre.style.fontSize = "inherit";
  pre.style.lineHeight = "inherit";

  const codeEl = pre.querySelector("code");
  if (!codeEl) return;
  codeEl.style.fontFamily = "inherit";
  codeEl.style.fontSize = "inherit";
  codeEl.style.lineHeight = "inherit";
}

function focusCodeBlockCloseFence(wrapper: HTMLElement): boolean {
  const closeFence = wrapper.querySelector(
    ".me-codeblock-fence--close",
  ) as HTMLElement | null;
  if (!closeFence) return false;
  focusElementWithoutScroll(closeFence);
  return true;
}

function insertLineAfterCodeBlock(
  parentView: EditorView,
  blockFrom: number,
): boolean {
  const block = getFencedBlockByStart(parentView.state, blockFrom);
  if (!block) return false;

  const insertPos = block.blockTo;
  const needsNewline =
    parentView.state.doc.sliceString(insertPos, insertPos + 1) !== "\n";
  const insert = needsNewline ? "\n\n" : "\n";
  const cursorPos = insertPos + insert.length;

  parentView.dispatch({
    changes: { from: insertPos, to: insertPos, insert },
    effects: setActiveCodeBlock.of(null),
    selection: EditorSelection.cursor(cursorPos),
    scrollIntoView: true,
  });
  parentView.focus();
  return true;
}

function moveSelectionAfterCodeBlock(
  parentView: EditorView,
  blockFrom: number,
): boolean {
  const block = getFencedBlockByStart(parentView.state, blockFrom);
  if (!block) return false;

  return exitWidgetWithArrowKey(
    parentView,
    { from: block.blockFrom, to: block.blockTo },
    "after",
    setActiveCodeBlock.of(null),
  );
}

function activateCodeBlock(
  view: EditorView,
  block: FencedBlockInfo,
  selection: EditorSelection,
  focusTarget: CodeBlockEditorMount["pendingFocusTarget"],
): boolean {
  view.dispatch({
    effects: [setActiveCodeBlock.of(block.blockFrom), view.scrollSnapshot()],
    selection,
  });

  requestAnimationFrame(() => {
    const widget = view.dom.querySelector(
      `.me-codeblock-widget[data-block-from="${block.blockFrom}"]`,
    ) as CodeBlockElement | null;
    const mount = widget?.__meCodeBlockEditor;
    if (!mount || mount.isDestroyed) return;
    mount.pendingFocusTarget = focusTarget;
    if (focusTarget === "language") {
      focusCodeBlockLanguage(widget);
      mount.pendingFocusTarget = null;
      return;
    }
    if (focusTarget === "code-end") {
      focusNestedEditor(
        mount,
        EditorSelection.create([
          EditorSelection.cursor(mount.view.state.doc.length),
        ]),
      );
      mount.pendingFocusTarget = null;
      return;
    }
    focusNestedEditor(
      mount,
      EditorSelection.create([EditorSelection.cursor(0)]),
    );
    mount.pendingFocusTarget = null;
  });

  return true;
}

function deactivateCodeBlock(
  parentView: EditorView,
  blockFrom: number,
): boolean {
  const block = getFencedBlockByStart(parentView.state, blockFrom)
  const targetPos = block ? block.blockTo : blockFrom
  parentView.dispatch({
    effects: [setActiveCodeBlock.of(null), parentView.scrollSnapshot()],
    selection: EditorSelection.cursor(targetPos),
  })
  parentView.focus()
  return true
}

function deleteCodeBlock(parentView: EditorView, blockFrom: number): boolean {
  const block = getFencedBlockByStart(parentView.state, blockFrom);
  if (!block) return false;

  parentView.dispatch({
    changes: { from: block.blockFrom, to: block.blockTo, insert: "" },
    effects: setActiveCodeBlock.of(null),
    selection: EditorSelection.cursor(block.blockFrom),
    scrollIntoView: true,
  });
  parentView.focus();
  return true;
}

function deactivateCodeBlockIfFocusLeft(
  parentView: EditorView,
  blockFrom: number,
  wrapper: HTMLElement,
): void {
  requestAnimationFrame(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest(".me-codeblock-widget") === wrapper) return;
    deactivateCodeBlock(parentView, blockFrom);
  });
}

function syncNestedEditorFromOuter(
  dom: CodeBlockElement,
  widget: CodeBlockWidget,
): void {
  const mount = dom.__meCodeBlockEditor;
  if (!mount || mount.isDestroyed) return;

  mount.blockFrom = widget.blockFrom;
  mount.contentFrom = widget.contentFrom;
  mount.contentTo = widget.contentTo;

  if (mount.currentLang !== widget.lang) {
    const langInput = dom.querySelector(
      ".me-codeblock-lang-input",
    ) as HTMLInputElement | null;
    if (langInput && langInput.value !== widget.lang) {
      langInput.value = widget.lang;
    }
    reconfigureNestedLanguage(mount, widget.lang);
  }

  const current = mount.view.state.doc.toString();
  if (current === widget.code) {
    mount.currentCode = widget.code;
    return;
  }

  mount.syncingFromOuter = true;
  const nestedSelection = mount.view.state.selection.main;
  const anchor = Math.max(
    0,
    Math.min(widget.code.length, nestedSelection.anchor),
  );
  const head = Math.max(0, Math.min(widget.code.length, nestedSelection.head));
  mount.view.dispatch({
    changes: { from: 0, to: current.length, insert: widget.code },
    selection: EditorSelection.range(anchor, head),
  });
  mount.syncingFromOuter = false;
  mount.currentCode = widget.code;
}

function createCodeBlockBoundary(
  view: EditorView,
  widget: CodeBlockWidget,
  side: "before" | "after",
): HTMLElement {
  const boundary = document.createElement("div");
  boundary.className = `me-widget-boundary me-widget-boundary--${side} me-codeblock-boundary me-codeblock-boundary--${side}`;
  boundary.setAttribute("role", "button");
  boundary.setAttribute("aria-label", side === "before" ? "Place cursor before code block" : "Place cursor after code block");
  boundary.addEventListener("mousedown", (event) => {
    handleWidgetBoundaryMouseDown(
      event,
      view,
      { from: widget.blockFrom, to: widget.blockTo },
      side,
      setActiveCodeBlock.of(null),
    );
  });
  return boundary;
}

function createNestedEditorDom(
  view: EditorView,
  widget: CodeBlockWidget,
): CodeBlockElement {
  const wrapper = document.createElement("div") as CodeBlockElement;
  wrapper.className = "me-codeblock-widget me-codeblock-widget--editing";
  wrapper.dataset.blockFrom = String(widget.blockFrom);

  const body = document.createElement("div");
  body.className = "me-codeblock-body";

  const topFence = document.createElement("div");
  topFence.className = "me-codeblock-fence me-codeblock-fence--open";

  const topFenceTicks = document.createElement("span");
  topFenceTicks.className = "me-codeblock-fence-ticks";
  topFenceTicks.textContent = "```";
  topFence.appendChild(topFenceTicks);

  const langInput = document.createElement("input");
  langInput.className = "me-codeblock-lang-input";
  langInput.type = "text";
  langInput.value = widget.lang;
  langInput.placeholder = "language";
  langInput.spellcheck = false;
  langInput.autocomplete = "off";
  langInput.autocapitalize = "off";
  langInput.setAttribute("autocorrect", "off");
  langInput.setAttribute("data-form-type", "other");
  langInput.setAttribute("data-lpignore", "true");
  langInput.setAttribute("data-1p-ignore", "true");
  langInput.setAttribute("aria-label", "Code block language");
  langInput.addEventListener("mousedown", (event) => event.stopPropagation());
  langInput.addEventListener("click", (event) => event.stopPropagation());
  langInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      deactivateCodeBlock(view, widget.blockFrom);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(view);
        else undo(view);
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo(view);
        return;
      }
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const block = getFencedBlockByStart(view.state, widget.blockFrom);
      if (!block) return;

      exitWidgetWithArrowKey(
        view,
        { from: block.blockFrom, to: block.blockTo },
        "before",
        setActiveCodeBlock.of(null),
      );
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const mount = wrapper.__meCodeBlockEditor;
      if (!mount || mount.isDestroyed) return;
      focusNestedEditor(
        mount,
        EditorSelection.create([EditorSelection.cursor(0)]),
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const mount = wrapper.__meCodeBlockEditor;
      if (!mount || mount.isDestroyed) return;
      focusNestedEditor(mount, mount.view.state.selection);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Backspace") {
      event.preventDefault();
      deleteCodeBlock(view, widget.blockFrom);
    }
  });
  langInput.addEventListener("input", () => {
    const mount = wrapper.__meCodeBlockEditor;
    if (!mount || mount.isDestroyed || mount.syncingFromOuter) return;

    const block = getFencedBlockByStart(view.state, mount.blockFrom);
    if (!block) return;

    const nextLang = langInput.value.trim();
    if (mount.currentLang !== nextLang) {
      reconfigureNestedLanguage(mount, nextLang);
    }
    const nextFence = `\`\`\`${nextLang}`;
    const currentFence = view.state.doc.sliceString(
      block.openingFenceFrom,
      block.openingFenceTo,
    );
    if (currentFence === nextFence) return;

    mount.syncingFromOuter = true;
    view.dispatch({
      changes: {
        from: block.openingFenceFrom,
        to: block.openingFenceTo,
        insert: nextFence,
      },
      selection: EditorSelection.create([
        EditorSelection.cursor(
          block.contentFrom + mount.view.state.selection.main.head,
        ),
      ]),
    });
    mount.syncingFromOuter = false;
  });
  topFence.appendChild(langInput);
  body.appendChild(topFence);

  const host = document.createElement("div");
  host.className = "me-codeblock-editor-host";
  body.appendChild(host);

  const bottomFence = document.createElement("div");
  bottomFence.className = "me-codeblock-fence me-codeblock-fence--close";
  bottomFence.textContent = "```";
  bottomFence.tabIndex = 0;
  bottomFence.setAttribute("role", "button");
  bottomFence.setAttribute("aria-label", "End code block");
  bottomFence.addEventListener("mousedown", (event) => event.stopPropagation());
  bottomFence.addEventListener("click", (event) => {
    event.stopPropagation();
    focusElementWithoutScroll(bottomFence);
  });
  bottomFence.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      insertLineAfterCodeBlock(view, widget.blockFrom);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const mount = wrapper.__meCodeBlockEditor;
      if (!mount || mount.isDestroyed) return;
      focusNestedEditor(
        mount,
        EditorSelection.create([
          EditorSelection.cursor(mount.view.state.doc.length),
        ]),
      );
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelectionAfterCodeBlock(view, widget.blockFrom);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      deactivateCodeBlock(view, widget.blockFrom);
    }
  });
  body.appendChild(bottomFence);

  wrapper.appendChild(createCodeBlockBoundary(view, widget, "before"));
  wrapper.appendChild(body);
  wrapper.appendChild(createCodeBlockBoundary(view, widget, "after"));

  const langCompartment = new Compartment();
  const nestedView = new EditorView({
    state: EditorState.create({
      doc: widget.code,
      selection: EditorSelection.create([
        EditorSelection.range(
          Math.max(
            0,
            Math.min(
              widget.code.length,
              view.state.selection.main.anchor - widget.contentFrom,
            ),
          ),
          Math.max(
            0,
            Math.min(
              widget.code.length,
              view.state.selection.main.head - widget.contentFrom,
            ),
          ),
        ),
      ]),
      extensions: [
        history(),
        keymap.of([
          {
            key: "ArrowUp",
            run(innerView) {
              const sel = innerView.state.selection.main;
              if (!sel.empty) return false;
              const line = innerView.state.doc.lineAt(sel.head);
              if (sel.head === line.from && line.number === 1) {
                return focusCodeBlockLanguage(wrapper);
              }

              // Immediately after Enter, browser geometry can lag behind the
              // nested document update and native vertical motion may skip the
              // newly added previous line. Map this empty-line case by source.
              if (line.length === 0 && line.number > 1) {
                const previous = innerView.state.doc.line(line.number - 1);
                innerView.dispatch({
                  selection: EditorSelection.cursor(previous.from),
                  scrollIntoView: true,
                });
                return true;
              }
              return false;
            },
          },
          {
            key: "ArrowDown",
            run(innerView) {
              const sel = innerView.state.selection.main;
              if (!sel.empty) return false;
              const line = innerView.state.doc.lineAt(sel.head);
              if (
                sel.head !== line.to ||
                line.to !== innerView.state.doc.length
              )
                return false;
              return focusCodeBlockCloseFence(wrapper);
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          {
            key: "Backspace",
            run(innerView) {
              if (innerView.state.doc.length > 0) return false;
              return deleteCodeBlock(view, widget.blockFrom);
            },
          },
          {
            key: "Escape",
            run: () => deactivateCodeBlock(view, widget.blockFrom),
          },
          {
            key: "Mod-Backspace",
            run: () => deleteCodeBlock(view, widget.blockFrom),
          },
          {
            key: "Mod-Delete",
            run: () => deleteCodeBlock(view, widget.blockFrom),
          },
        ]),
        nestedEditorTheme,
        syntaxHighlighting(widget.options.codeHighlightStyle ?? githubDarkCodeHighlightStyle, { fallback: true }),
        langCompartment.of([]),
        EditorView.updateListener.of((update) => {
          const mount = wrapper.__meCodeBlockEditor;
          if (!mount || mount.isDestroyed || mount.syncingFromOuter) return;
          if (!update.docChanged) return;

          const block = getFencedBlockByStart(view.state, mount.blockFrom);
          if (!block) return;

          const nextCode = update.state.doc.toString();
          if (block.code === nextCode) return;

          mount.syncingFromOuter = true;
          view.dispatch({
            changes: {
              from: block.contentFrom,
              to: block.contentTo,
              insert: nextCode,
            },
            effects: view.scrollSnapshot(),
            selection: EditorSelection.create([
              EditorSelection.range(
                block.contentFrom + update.state.selection.main.anchor,
                block.contentFrom + update.state.selection.main.head,
              ),
            ]),
          });
          mount.syncingFromOuter = false;
          mount.currentCode = nextCode;
        }),
        EditorView.domEventHandlers({
          blur() {
            deactivateCodeBlockIfFocusLeft(view, widget.blockFrom, wrapper);
            return false;
          },
        }),
      ],
    }),
    parent: host,
  });

  wrapper.__meCodeBlockEditor = {
    view: nestedView,
    langCompartment,
    currentCode: widget.code,
    currentLang: widget.lang,
    blockFrom: widget.blockFrom,
    contentFrom: widget.contentFrom,
    contentTo: widget.contentTo,
    syncingFromOuter: false,
    isDestroyed: false,
    languageLoadId: 0,
    pendingFocusTarget: null,
    codeLanguages: widget.options.codeLanguages,
  };

  const mount = wrapper.__meCodeBlockEditor;
  reconfigureNestedLanguage(mount, widget.lang);

  requestAnimationFrame(() => {
    if (!wrapper.__meCodeBlockEditor || mount.isDestroyed) return;
    if (mount.pendingFocusTarget === "language") {
      mount.pendingFocusTarget = null;
      focusCodeBlockLanguage(wrapper);
      return;
    }
    if (mount.pendingFocusTarget === "code-end") {
      mount.pendingFocusTarget = null;
      focusNestedEditor(
        mount,
        EditorSelection.create([
          EditorSelection.cursor(mount.view.state.doc.length),
        ]),
      );
      return;
    }
    mount.pendingFocusTarget = null;
    focusNestedEditor(mount, nestedView.state.selection);
  });

  return wrapper;
}

class CodeBlockWidget extends WidgetType {
  constructor(
    readonly blockFrom: number,
    readonly blockTo: number,
    readonly contentFrom: number,
    readonly contentTo: number,
    readonly code: string,
    readonly lang: string,
    readonly highlighted: string | null,
    readonly isEditing: boolean,
    readonly options: CodeBlockOptions,
  ) {
    super();
  }

  override eq(other: CodeBlockWidget): boolean {
    return (
      this.blockFrom === other.blockFrom &&
      this.blockTo === other.blockTo &&
      this.contentFrom === other.contentFrom &&
      this.contentTo === other.contentTo &&
      this.code === other.code &&
      this.lang === other.lang &&
      this.highlighted === other.highlighted &&
      this.isEditing === other.isEditing
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    if (this.isEditing) {
      return createNestedEditorDom(view, this);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "me-codeblock-widget";
    wrapper.dataset.blockFrom = String(this.blockFrom);

    const header = document.createElement("div");
    header.className = "me-codeblock-header";

    if (this.lang) {
      const label = document.createElement("span");
      label.className = "me-lang-label";
      label.textContent = this.lang;
      header.appendChild(label);
    }

    const btn = document.createElement("button");
    btn.className = "me-copy-btn";
    btn.textContent = "Copy";
    btn.type = "button";
    btn.setAttribute("aria-label", "Copy code");
    btn.addEventListener("mousedown", (event) => event.preventDefault());
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(this.code);
        btn.textContent = "Copied";
        btn.classList.add("me-copy-btn--copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("me-copy-btn--copied");
        }, 1500);
      } catch {
        btn.textContent = "Failed";
        setTimeout(() => {
          btn.textContent = "Copy";
        }, 1500);
      }
    });
    header.appendChild(btn);
    wrapper.appendChild(createCodeBlockBoundary(view, this, "before"));
    wrapper.appendChild(header);

    const body = document.createElement("div");
    body.className = "me-codeblock-body";
    body.dataset.code = this.code;
    body.dataset.lang = this.lang;
    body.innerHTML = renderCodeHtml(this.code, this.lang, this.highlighted);
    normalizeRenderedCodeBlock(body);
    if (!this.highlighted && this.lang) {
      const code = this.code;
      const lang = this.lang;
      void highlightCodeHtml(this.options.codeHighlighter, code, lang).then((html) => {
        if (!html || body.dataset.code !== code || body.dataset.lang !== lang) return;
        body.innerHTML = html;
        normalizeRenderedCodeBlock(body);
      });
    }

    wrapper.appendChild(body);
    wrapper.appendChild(createCodeBlockBoundary(view, this, "after"));
    return wrapper;
  }

  override updateDOM(dom: HTMLElement): boolean {
    const wrapper = dom as CodeBlockElement;

    if (this.isEditing) {
      if (!wrapper.__meCodeBlockEditor) return false;
      syncNestedEditorFromOuter(wrapper, this);
      return true;
    }

    return false;
  }

  override destroy(dom: HTMLElement): void {
    const wrapper = dom as CodeBlockElement;
    const mount = wrapper.__meCodeBlockEditor;
    if (!mount) return;
    mount.isDestroyed = true;
    mount.view.destroy();
    delete wrapper.__meCodeBlockEditor;
  }

  override ignoreEvent(): boolean {
    return this.isEditing;
  }
}

export function buildCodeBlockDecorations(state: EditorState, options: CodeBlockOptions): DecorationSet {
  const ranges: ReturnType<Decoration["range"]>[] = [];
  const doc = state.doc;
  const activeBlockFrom = state.facet(EditorView.editable)
    ? state.field(activeCodeBlockField, false)
    : null;

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter(node) {
      if (node.name !== "FencedCode") return;

      const block = getFencedBlockInfo(state, node.from);
      if (!block) return;
      if (options.excludedLanguages?.some(
        (language) => language.toLowerCase() === block.lang.toLowerCase(),
      )) return;

      const highlighted = null;

      ranges.push(
        Decoration.replace({
          widget: new CodeBlockWidget(
            block.blockFrom,
            block.blockTo,
            block.contentFrom,
            block.contentTo,
            block.code,
            block.lang,
            highlighted,
            activeBlockFrom === block.blockFrom,
            options,
          ),
          block: true,
          inclusive: true,
        }).range(block.blockFrom, block.blockTo),
      );
    },
  });

  return Decoration.set(ranges, true);
}

export const codeBlockClickToEdit = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!view.state.facet(EditorView.editable)) return false;

    const target = event.target as HTMLElement | null;
    const widget = target?.closest(
      ".me-codeblock-widget",
    ) as HTMLElement | null;
    const activeBlockFrom = view.state.field(activeCodeBlockField, false);

    if (!widget) {
      if (activeBlockFrom != null) {
        return deactivateCodeBlock(view, activeBlockFrom);
      }
      return false;
    }

    if (target?.closest(".me-copy-btn")) return false;
    if (target?.closest(".me-codeblock-editor-host .cm-editor")) return false;

    const blockFromText = widget.dataset.blockFrom;
    if (!blockFromText) return false;

    const block = getFencedBlockByStart(view.state, Number(blockFromText));
    if (!block) return false;

    const selection = getSelectionForBlockClick(
      view,
      block,
      event,
      (anchor) => EditorSelection.create([EditorSelection.cursor(anchor)]),
    );
    activateCodeBlock(view, block, selection, "code-start");
    event.preventDefault();
    return true;
  },
});

function moveUpToTextEnteredAfterCodeBlock(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const doc = view.state.doc;
  const currentLine = doc.lineAt(selection.head);
  if (
    selection.head !== currentLine.from ||
    currentLine.length !== 0 ||
    currentLine.number <= 2
  ) {
    return false;
  }

  const previousLine = doc.line(currentLine.number - 1);
  const possibleClosingFence = doc.line(currentLine.number - 2);
  if (
    previousLine.length === 0 ||
    possibleClosingFence.text.trim() !== "```"
  ) {
    return false;
  }

  const block = getFencedBlockInfo(view.state, possibleClosingFence.from);
  if (
    !block ||
    doc.lineAt(block.blockTo).number !== possibleClosingFence.number
  ) {
    return false;
  }

  view.dispatch({
    effects: view.scrollSnapshot(),
    selection: EditorSelection.cursor(previousLine.from),
  });
  return true;
}

export const codeBlockArrowNavigation = Prec.high(
  keymap.of([
    {
      key: 'ArrowDown',
      run(view) {
        if (!view.state.facet(EditorView.editable)) return false

        const selection = view.state.selection.main
        if (!selection.empty) return false

        const block = getAdjacentFencedBlock(
          view.state,
          selection.head,
          'down',
        )
        if (!block) return false

        return activateCodeBlock(
          view,
          block,
          EditorSelection.create([EditorSelection.cursor(block.contentFrom)]),
          'language',
        )
      },
    },
    {
      key: 'ArrowUp',
      run(view) {
        if (!view.state.facet(EditorView.editable)) return false

        const selection = view.state.selection.main
        if (!selection.empty) return false
        if (moveUpToTextEnteredAfterCodeBlock(view)) return true

        const block = getAdjacentFencedBlock(view.state, selection.head, 'up')
        if (!block) return false

        return activateCodeBlock(
          view,
          block,
          EditorSelection.create([EditorSelection.cursor(block.contentTo)]),
          'code-end',
        )
      },
    },
  ]),
);

export const autoCloseCodeFence = EditorView.inputHandler.of(
  (view, from, to, text, _insert) => {
    if (!view.state.facet(EditorView.editable)) return false;
    if (text !== "`") return false;

    const selection = view.state.selection.main;
    if (!selection.empty || selection.from !== from || selection.to !== to)
      return false;

    const line = view.state.doc.lineAt(from);
    const before = view.state.doc.sliceString(line.from, from);
    const after = view.state.doc.sliceString(to, line.to);

    if (before !== "``" || after.length > 0) return false;

    view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: "```\n\n```",
      },
      effects: setActiveCodeBlock.of(line.from),
      selection: EditorSelection.cursor(line.from + 4),
      scrollIntoView: true,
    });

    requestAnimationFrame(() => {
      const block = getFencedBlockByStart(view.state, line.from);
      if (!block) return;
      activateCodeBlock(
        view,
        block,
        EditorSelection.create([EditorSelection.cursor(block.contentFrom)]),
        "language",
      );
    });

    return true;
  },
);

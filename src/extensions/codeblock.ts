import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  WidgetType,
} from "@codemirror/view";
import {
  LanguageDescription,
  defaultHighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { ensureShiki, highlight, isLangLoaded, loadLang } from "./shiki";

type FencedBlockInfo = {
  blockFrom: number;
  blockTo: number;
  openingFenceFrom: number;
  openingFenceTo: number;
  contentFrom: number;
  contentTo: number;
  code: string;
  lang: string;
};

type CodeBlockEditorMount = {
  view: EditorView;
  langCompartment: Compartment;
  currentCode: string;
  currentLang: string;
  blockFrom: number;
  contentFrom: number;
  contentTo: number;
  syncingFromOuter: boolean;
  isDestroyed: boolean;
  languageLoadId: number;
  pendingFocusTarget: "language" | "code-start" | "code-end" | null;
};

type CodeBlockElement = HTMLDivElement & {
  __meCodeBlockEditor?: CodeBlockEditorMount;
};

const setActiveCodeBlock = StateEffect.define<number | null>();
const languageExtensionCache = new Map<string, Promise<Extension>>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCodeHtml(
  code: string,
  lang: string,
  highlighted: string | null,
): string {
  if (highlighted) return highlighted;
  if (lang && isLangLoaded(lang)) {
    return (
      highlight(code, lang) ?? `<pre><code>${escapeHtml(code)}</code></pre>`
    );
  }
  return `<pre><code>${escapeHtml(code)}</code></pre>`;
}

function getFencedBlockInfo(
  state: EditorState,
  pos: number,
): FencedBlockInfo | null {
  const doc = state.doc;
  let result: FencedBlockInfo | null = null;

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter(node) {
      if (node.name !== "FencedCode") return;
      if (pos < node.from || pos > node.to) return;

      const blockFrom = node.from;
      const blockTo = node.to;
      const blockFromLine = doc.lineAt(blockFrom).number;
      const blockToLine = doc.lineAt(blockTo).number;
      const openingFence = doc.line(blockFromLine);
      const contentFrom =
        blockFromLine < blockToLine
          ? doc.line(blockFromLine + 1).from
          : blockFrom;
      const contentTo =
        blockFromLine < blockToLine
          ? doc.line(blockToLine).from - 1
          : blockFrom;
      const code = doc.sliceString(contentFrom, contentTo);
      const fenceLine = doc.lineAt(blockFrom).text;
      const langMatch = fenceLine.match(/^```(\w*)/);
      const lang = langMatch?.[1] ?? "";

      result = {
        blockFrom,
        blockTo,
        openingFenceFrom: openingFence.from,
        openingFenceTo: openingFence.to,
        contentFrom,
        contentTo,
        code,
        lang,
      };
      return false;
    },
  });

  return result;
}

function getFencedBlockByStart(
  state: EditorState,
  blockFrom: number,
): FencedBlockInfo | null {
  return getFencedBlockInfo(state, blockFrom);
}

function getOffsetForLine(code: string, lineIndex: number): number {
  if (lineIndex <= 0) return 0;
  let offset = 0;
  let currentLine = 0;
  while (currentLine < lineIndex && offset < code.length) {
    const nextBreak = code.indexOf("\n", offset);
    if (nextBreak === -1) return code.length;
    offset = nextBreak + 1;
    currentLine += 1;
  }
  return offset;
}

function getSelectionForBlockClick(
  _view: EditorView,
  block: FencedBlockInfo,
  event: MouseEvent,
): EditorSelection {
  const widget = (event.target as HTMLElement | null)?.closest(
    ".me-codeblock-widget",
  ) as HTMLElement | null;
  const body = widget?.querySelector(
    ".me-codeblock-body",
  ) as HTMLElement | null;

  if (!body || block.code.length === 0) {
    return EditorSelection.create([EditorSelection.cursor(block.contentFrom)]);
  }

  const rect = body.getBoundingClientRect();
  const bodyStyle = getComputedStyle(body);
  const lineHeight = Number.parseFloat(bodyStyle.lineHeight) || 22;
  const relativeY = Math.max(0, event.clientY - rect.top);
  const lines = block.code.split("\n");
  const lineIndex = Math.min(
    lines.length - 1,
    Math.floor(relativeY / lineHeight),
  );
  const offset = getOffsetForLine(block.code, lineIndex);
  return EditorSelection.create([
    EditorSelection.cursor(block.contentFrom + offset),
  ]);
}

function getCodeLanguageExtension(lang: string): Promise<Extension> {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) return Promise.resolve([]);

  const cached = languageExtensionCache.get(normalized);
  if (cached) return cached;

  const promise = (async () => {
    const description = LanguageDescription.matchLanguageName(
      languages,
      normalized,
      true,
    );
    if (!description) return [];
    try {
      return await description.load();
    } catch {
      return [];
    }
  })();

  languageExtensionCache.set(normalized, promise);
  return promise;
}

const nestedEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
  },
  ".cm-editor": {
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.6",
    overflowX: "auto",
    minHeight: "0",
    height: "auto",
  },
  ".cm-content": {
    fontFamily: "inherit",
    fontSize: "inherit",
    padding: "0",
    minHeight: "0",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--me-text, #1a1a1a)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
  },
});

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
  void getCodeLanguageExtension(lang).then((extension) => {
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
  langInput.focus();
  langInput.setSelectionRange(langInput.value.length, langInput.value.length);
  return true;
}

function focusCodeBlockCloseFence(wrapper: HTMLElement): boolean {
  const closeFence = wrapper.querySelector(
    ".me-codeblock-fence--close",
  ) as HTMLElement | null;
  if (!closeFence) return false;
  closeFence.focus();
  return true;
}

function getAdjacentFencedBlock(
  state: EditorState,
  pos: number,
  direction: "up" | "down",
): FencedBlockInfo | null {
  const doc = state.doc;
  const line = doc.lineAt(pos);

  if (direction === "down") {
    if (line.number >= doc.lines) return null;
    const nextLine = doc.line(line.number + 1);
    return getFencedBlockInfo(state, nextLine.from);
  }

  if (line.number <= 1) return null;
  const prevLine = doc.line(line.number - 1);
  return getFencedBlockInfo(state, prevLine.from);
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

  const doc = parentView.state.doc;
  if (block.blockTo >= doc.length) {
    return insertLineAfterCodeBlock(parentView, blockFrom);
  }

  const nextLine = doc.lineAt(block.blockTo + 1);
  parentView.dispatch({
    effects: setActiveCodeBlock.of(null),
    selection: EditorSelection.cursor(nextLine.from),
    scrollIntoView: true,
  });
  parentView.focus();
  return true;
}

function activateCodeBlock(
  view: EditorView,
  block: FencedBlockInfo,
  selection: EditorSelection,
  focusTarget: CodeBlockEditorMount["pendingFocusTarget"],
): boolean {
  view.dispatch({
    effects: setActiveCodeBlock.of(block.blockFrom),
    selection,
    scrollIntoView: true,
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
  const block = getFencedBlockByStart(parentView.state, blockFrom);
  parentView.dispatch({
    effects: setActiveCodeBlock.of(null),
    selection: EditorSelection.cursor(block?.blockTo ?? blockFrom),
    scrollIntoView: true,
  });
  parentView.focus();
  return true;
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
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const block = getFencedBlockByStart(view.state, widget.blockFrom);
      if (!block) return;

      const doc = view.state.doc;
      const blockLine = doc.lineAt(block.blockFrom);
      if (blockLine.number <= 1) {
        deactivateCodeBlock(view, widget.blockFrom);
        return;
      }

      const previousLine = doc.line(blockLine.number - 1);
      view.dispatch({
        effects: setActiveCodeBlock.of(null),
        selection: EditorSelection.cursor(previousLine.to),
        scrollIntoView: true,
      });
      view.focus();
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
    bottomFence.focus();
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

  wrapper.appendChild(body);

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
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          {
            key: "ArrowUp",
            run(innerView) {
              const sel = innerView.state.selection.main;
              if (!sel.empty) return false;
              const line = innerView.state.doc.lineAt(sel.head);
              if (sel.head !== line.from || line.number !== 1) return false;
              return focusCodeBlockLanguage(wrapper);
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
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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
  ) {
    super();
  }

  override eq(other: CodeBlockWidget): boolean {
    if (
      this.isEditing &&
      other.isEditing &&
      this.blockFrom === other.blockFrom
    ) {
      return true;
    }

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
    wrapper.appendChild(header);

    const body = document.createElement("div");
    body.className = "me-codeblock-body";
    body.innerHTML = renderCodeHtml(this.code, this.lang, this.highlighted);

    const pre = body.querySelector("pre");
    if (pre) {
      pre.style.margin = "0";
      pre.style.padding = "0";
      pre.style.background = "transparent";
      pre.style.fontFamily = "inherit";
      pre.style.fontSize = "inherit";
      pre.style.lineHeight = "inherit";
      const codeEl = pre.querySelector("code");
      if (codeEl) {
        codeEl.style.fontFamily = "inherit";
        codeEl.style.fontSize = "inherit";
        codeEl.style.lineHeight = "inherit";
      }
    }

    wrapper.appendChild(body);
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

const activeCodeBlockField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(value, tr) {
    let nextValue = value;

    if (nextValue != null) {
      nextValue = tr.changes.mapPos(nextValue, -1);
    }

    for (const effect of tr.effects) {
      if (effect.is(setActiveCodeBlock)) {
        nextValue = effect.value;
      }
    }

    return nextValue;
  },
});

function buildCodeBlockDecorations(state: EditorState): DecorationSet {
  ensureShiki();

  const ranges: ReturnType<Decoration["range"]>[] = [];
  const doc = state.doc;
  const activeBlockFrom = state.field(activeCodeBlockField, false);

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter(node) {
      if (node.name !== "FencedCode") return;

      const block = getFencedBlockInfo(state, node.from);
      if (!block) return;

      const highlighted =
        block.lang && isLangLoaded(block.lang)
          ? highlight(block.code, block.lang)
          : null;
      if (block.lang && !isLangLoaded(block.lang)) {
        void loadLang(block.lang);
      }

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
          ),
          block: true,
          inclusive: true,
        }).range(block.blockFrom, block.blockTo),
      );
    },
  });

  return Decoration.set(ranges, true);
}

const codeBlockDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildCodeBlockDecorations(state);
  },
  update(_value, tr) {
    return buildCodeBlockDecorations(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const codeBlockClickToEdit = EditorView.domEventHandlers({
  mousedown(event, view) {
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

    const selection = getSelectionForBlockClick(view, block, event);
    activateCodeBlock(view, block, selection, "code-start");
    event.preventDefault();
    return true;
  },
});

const codeBlockArrowNavigation = Prec.high(
  keymap.of([
    {
      key: "ArrowDown",
      run(view) {
        const selection = view.state.selection.main;
        if (!selection.empty) return false;
        const line = view.state.doc.lineAt(selection.head);
        if (selection.head !== line.to) return false;

        const block = getAdjacentFencedBlock(
          view.state,
          selection.head,
          "down",
        );
        if (!block) return false;

        return activateCodeBlock(
          view,
          block,
          EditorSelection.create([EditorSelection.cursor(block.contentFrom)]),
          "language",
        );
      },
    },
    {
      key: "ArrowUp",
      run(view) {
        const selection = view.state.selection.main;
        if (!selection.empty) return false;
        const line = view.state.doc.lineAt(selection.head);
        if (selection.head !== line.from) return false;

        const block = getAdjacentFencedBlock(view.state, selection.head, "up");
        if (!block) return false;

        return activateCodeBlock(
          view,
          block,
          EditorSelection.create([EditorSelection.cursor(block.contentTo)]),
          "code-end",
        );
      },
    },
  ]),
);

const autoCloseCodeFence = EditorView.inputHandler.of(
  (view, from, to, text, _insert) => {
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

export const codeBlockDecorations = [
  activeCodeBlockField,
  codeBlockDecorationField,
  codeBlockClickToEdit,
  codeBlockArrowNavigation,
  autoCloseCodeFence,
];

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Markdown as MarkdownExtension } from "tiptap-markdown";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bold, Italic, Code, List, ListOrdered, Link as LinkIcon, Undo, Redo } from "lucide-react";

// Defence-in-depth: both the Tiptap Link extension and the link-insert prompt
// reject any URL whose protocol isn't in this allowlist. `javascript:`,
// `data:`, `file:`, custom schemes — all rejected. The view-mode Markdown
// renderer already requires `https?://`, so attackers can't bypass this by
// crafting a payload server-side either.
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function isSafeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    // Relative paths without a scheme are allowed — URL() throws, so we
    // fall through to a minimal static check.
    const u = new URL(trimmed, "https://placeholder.invalid");
    if (u.origin === "https://placeholder.invalid") {
      // It was a relative reference. Reject anything that still smells like
      // a scheme smuggled in via colon (e.g. "javascript:x").
      return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    }
    return ALLOWED_URL_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Disable block-level (lists, headings) — useful for inline fields. */
  inline?: boolean;
};

/**
 * Tiptap-based rich-text editor that reads and writes Markdown. Only exposes
 * features the app's Markdown renderer understands (bold, italic, inline code,
 * lists, links) so what you edit is what renders in view mode.
 */
export function RichEditor({ value, onChange, placeholder, minHeight = 72, inline = false }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        // Lists are disabled in inline mode so single-line fields stay single-line.
        ...(inline ? { bulletList: false, orderedList: false, listItem: false } : {}),
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
        validate: (href) => isSafeUrl(href),
      }),
      MarkdownExtension.configure({
        html: false,
        tightLists: true,
        linkify: true,
        breaks: true,
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: `prose-editor tiptap-content w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-500 dark:focus:border-brand-500`,
        style: `min-height:${minHeight}px`,
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown?.getMarkdown?.() ?? editor.getText();
      onChange(md);
    },
  });

  // External value changes (cancel → revert, loading fresh data) must flow
  // back into the editor. We skip the sync when the editor already shows the
  // same markdown so we don't fight the user's cursor mid-typing.
  useEffect(() => {
    if (!editor) return;
    const current: string = editor.storage.markdown?.getMarkdown?.() ?? "";
    if (current !== (value ?? "")) {
      editor.commands.setContent(value ?? "", false);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="space-y-1">
      <Toolbar editor={editor} inline={inline} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, inline }: { editor: Editor; inline: boolean }) {
  const { t } = useTranslation();

  function toggleLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("editor.link_prompt"), prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isSafeUrl(url)) {
      window.alert(t("editor.link_rejected"));
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  const btn = (active: boolean) =>
    `px-1.5 py-0.5 rounded text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${active ? "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100" : ""}`;

  return (
    <div className="flex flex-wrap gap-0.5 text-xs">
      <button type="button" aria-label={t("editor.bold")} className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()} title={t("editor.bold")}>
        <Bold size={12} />
      </button>
      <button type="button" aria-label={t("editor.italic")} className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()} title={t("editor.italic")}>
        <Italic size={12} />
      </button>
      <button type="button" aria-label={t("editor.code")} className={btn(editor.isActive("code"))}
        onClick={() => editor.chain().focus().toggleCode().run()} title={t("editor.code")}>
        <Code size={12} />
      </button>
      {!inline && (
        <>
          <span className="w-px bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden />
          <button type="button" aria-label={t("editor.bullet_list")} className={btn(editor.isActive("bulletList"))}
            onClick={() => editor.chain().focus().toggleBulletList().run()} title={t("editor.bullet_list")}>
            <List size={12} />
          </button>
          <button type="button" aria-label={t("editor.numbered_list")} className={btn(editor.isActive("orderedList"))}
            onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t("editor.numbered_list")}>
            <ListOrdered size={12} />
          </button>
        </>
      )}
      <span className="w-px bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden />
      <button type="button" aria-label={t("editor.link")} className={btn(editor.isActive("link"))}
        onClick={toggleLink} title={t("editor.link")}>
        <LinkIcon size={12} />
      </button>
      <span className="flex-1" />
      <button type="button" aria-label={t("editor.undo")} className={btn(false)}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()} title={t("editor.undo")}>
        <Undo size={12} />
      </button>
      <button type="button" aria-label={t("editor.redo")} className={btn(false)}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()} title={t("editor.redo")}>
        <Redo size={12} />
      </button>
    </div>
  );
}

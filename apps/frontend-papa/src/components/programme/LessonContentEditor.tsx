import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  DiffSourceToggleWrapper,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  diffSourcePlugin,
  headingsPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

// Éditeur riche du cours (markdown natif : Lexical + mdast, markdown in → markdown
// out, jamais de HTML persisté — le backend re-scrubbe de toute façon). Chargé en
// React.lazy depuis la modale : le bundle Lexical/CodeMirror ne pèse que sur le mode
// édition. `suppressHtmlProcessing` : un cours de LLM local peut contenir du
// pseudo-HTML ou un « x<y » mathématique — traité comme texte, pas parsé. Le mode
// source (diffSourcePlugin) est l'issue de secours officielle si le rich-text bute.
export default function LessonContentEditor({
  initialMarkdown,
  onChange,
  contentClassName,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  /** Styles typographiques de la zone éditable — fournis par la modale (mêmes
   *  classes que le rendu lecture, l'édition ressemble au résultat). */
  contentClassName?: string;
}) {
  return (
    <MDXEditor
      className="dark-theme lesson-content-editor"
      markdown={initialMarkdown}
      onChange={onChange}
      suppressHtmlProcessing
      onError={(payload) => console.warn("LessonContentEditor :", payload)}
      contentEditableClassName={`min-h-56 ${contentClassName ?? ""}`}
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        tablePlugin(),
        markdownShortcutPlugin(),
        diffSourcePlugin({ viewMode: "rich-text" }),
        toolbarPlugin({
          toolbarContents: () => (
            <DiffSourceToggleWrapper>
              <UndoRedo />
              <BoldItalicUnderlineToggles />
              <BlockTypeSelect />
              <ListsToggle />
              <InsertTable />
              <InsertThematicBreak />
            </DiffSourceToggleWrapper>
          ),
        }),
      ]}
    />
  );
}

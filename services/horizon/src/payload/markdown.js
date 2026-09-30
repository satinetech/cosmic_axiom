/**
 * Operator Markdown to a closed block/inline tree.
 *
 * Report prose is written by operators, so a template should never have to
 * interpret it. This parses CommonMark plus GitHub tables, strikethrough and
 * bare-URL autolinks, and maps the result onto a small fixed set of node types
 * that a template renders with one short function:
 *
 *   blocks:  paragraph, heading, list, codeBlock, quote, table, rule
 *   inlines: text, strong, emphasis, strike, code, link, break
 *
 * Nothing outside that set reaches the payload. In particular:
 *
 * - Raw HTML is kept as literal text, never as markup. Security findings
 *   quote payloads such as <script>alert(1)</script>; they must survive,
 *   and must be inert.
 * - Links keep only http, https and mailto targets; any other link becomes
 *   its text.
 * - Markdown images become their alt text. Finding images are attached
 *   separately, not referenced from prose.
 * - A single newline is a line break, as it looks in the editor's textarea,
 *   rather than CommonMark's "join into one line".
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";

const SAFE_URL = /^(https?:|mailto:)/i;

/** @returns {Array<object>} blocks; empty for blank input */
export function markdownToBlocks(source) {
    // Browsers submit textarea content with CRLF line endings.
    const markdown = source === null || source === undefined ? "" : String(source).replace(/\r\n?/g, "\n");
    if (markdown.trim() === "") return [];

    const tree = fromMarkdown(markdown, {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
    });
    const definitions = new Map();
    collectDefinitions(tree, definitions);
    return blocks(tree.children, { definitions, markdown });
}

function collectDefinitions(node, definitions) {
    if (node.type === "definition") definitions.set(node.identifier, node.url);
    for (const child of node.children || []) collectDefinitions(child, definitions);
}

function blocks(nodes, ctx) {
    return nodes.flatMap((node) => block(node, ctx));
}

function block(node, ctx) {
    switch (node.type) {
        case "paragraph": {
            const children = inlines(node.children, ctx);
            return children.length ? [{ type: "paragraph", children }] : [];
        }
        case "heading":
            return [{ type: "heading", level: node.depth, children: inlines(node.children, ctx) }];
        case "list":
            return [{
                type: "list",
                ordered: Boolean(node.ordered),
                start: node.ordered ? (node.start ?? 1) : null,
                items: node.children.map((item) => listItem(item, ctx)),
            }];
        case "code":
            return [{ type: "codeBlock", lang: node.lang || null, text: node.value }];
        case "blockquote":
            return [{ type: "quote", children: blocks(node.children, ctx) }];
        case "table": {
            const [header = { children: [] }, ...rows] = node.children;
            const cells = (row) => row.children.map((cell) => inlines(cell.children, ctx));
            return [{
                type: "table",
                align: (node.align || []).map((a) => a || null),
                header: cells(header),
                rows: rows.map(cells),
            }];
        }
        case "thematicBreak":
            return [{ type: "rule" }];
        case "html":
            return literal(node.value, ctx);
        case "definition":
            return [];
        case "footnoteDefinition": {
            // Keep the note's text, labelled, where it was written.
            const [first, ...rest] = blocks(node.children, ctx);
            const label = { type: "text", text: `[^${node.label ?? node.identifier}]: ` };
            if (first?.type === "paragraph") {
                return [{ ...first, children: mergeText([label, ...first.children]) }, ...rest];
            }
            return [{ type: "paragraph", children: [label] }, ...(first ? [first] : []), ...rest];
        }
        default:
            // Anything the parser grows later degrades to its source text.
            return literal(sourceOf(node, ctx), ctx);
    }
}

/** Source text as a paragraph, newlines kept as breaks. */
function literal(value, ctx) {
    const children = inlines([{ type: "text", value }], ctx);
    return children.length ? [{ type: "paragraph", children }] : [];
}

function listItem(item, ctx) {
    const content = blocks(item.children, ctx);
    if (typeof item.checked === "boolean") {
        // Task-list boxes are kept as text rather than given a node type.
        const box = { type: "text", text: item.checked ? "[x] " : "[ ] " };
        if (content[0]?.type === "paragraph") {
            content[0] = { ...content[0], children: mergeText([box, ...content[0].children]) };
        } else {
            content.unshift({ type: "paragraph", children: [box] });
        }
    }
    return content;
}

function inlines(nodes, ctx) {
    return mergeText(nodes.flatMap((node) => inline(node, ctx)));
}

function inline(node, ctx) {
    switch (node.type) {
        case "text":
            // A soft line break arrives as a newline inside a text node.
            return node.value.split("\n").flatMap((part, i) =>
                i === 0 ? [text(part)] : [{ type: "break" }, text(part)]);
        case "strong":
        case "emphasis":
            return [{ type: node.type, children: inlines(node.children, ctx) }];
        case "delete":
            return [{ type: "strike", children: inlines(node.children, ctx) }];
        case "inlineCode":
            return [{ type: "code", text: node.value }];
        case "break":
            return [{ type: "break" }];
        case "link":
            return link(node.url, node.children, ctx);
        case "linkReference":
            return link(ctx.definitions.get(node.identifier) ?? "", node.children, ctx);
        case "image":
        case "imageReference":
            return [text(node.alt || "")];
        case "html":
            return inline({ type: "text", value: node.value }, ctx);
        case "footnoteReference":
            return [text(`[^${node.label ?? node.identifier}]`)];
        default:
            return [text(sourceOf(node, ctx))];
    }
}

function link(url, children, ctx) {
    const content = inlines(children, ctx);
    if (!SAFE_URL.test(url)) return content;
    return [{ type: "link", url, children: content.length ? content : [text(url)] }];
}

function text(value) {
    return { type: "text", text: value };
}

/** Join adjacent text nodes and drop empty ones. */
function mergeText(nodes) {
    const out = [];
    for (const node of nodes) {
        if (node.type === "text") {
            if (node.text === "") continue;
            const last = out[out.length - 1];
            if (last?.type === "text") {
                out[out.length - 1] = text(last.text + node.text);
                continue;
            }
        }
        out.push(node);
    }
    return out;
}

function sourceOf(node, ctx) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    return start !== undefined && end !== undefined ? ctx.markdown.slice(start, end) : "";
}

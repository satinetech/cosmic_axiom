import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { markdownToBlocks } from "../src/payload/markdown.js";

const t = (text) => ({ type: "text", text });
const p = (...children) => ({ type: "paragraph", children });
const br = { type: "break" };

/** Every text node's text, in order, however deeply nested. */
function allText(node) {
    if (Array.isArray(node)) return node.map(allText).join("");
    if (node.type === "text" || node.type === "code" || node.type === "codeBlock") return node.text;
    return [node.children, node.items, node.header, node.rows]
        .filter(Boolean).map(allText).join("");
}

describe("markdownToBlocks", () => {
    test("blank input gives no blocks", () => {
        for (const blank of [null, undefined, "", "  \n\t\n"]) {
            assert.deepEqual(markdownToBlocks(blank), []);
        }
    });

    test("paragraphs, with a single newline kept as a line break", () => {
        assert.deepEqual(markdownToBlocks("one\ntwo\n\nthree"), [p(t("one"), br, t("two")), p(t("three"))]);
    });

    test("CRLF and CR line endings behave like LF", () => {
        assert.deepEqual(markdownToBlocks("one\r\ntwo\r\n\r\nthree\rfour"),
            [p(t("one"), br, t("two")), p(t("three"), br, t("four"))]);
    });

    test("emphasis, strong, strikethrough and inline code", () => {
        assert.deepEqual(markdownToBlocks("*a* **b** ~~c~~ `d <e>`"), [p(
            { type: "emphasis", children: [t("a")] }, t(" "),
            { type: "strong", children: [t("b")] }, t(" "),
            { type: "strike", children: [t("c")] }, t(" "),
            { type: "code", text: "d <e>" },
        )]);
    });

    test("headings keep their level", () => {
        assert.deepEqual(markdownToBlocks("## Steps"), [{ type: "heading", level: 2, children: [t("Steps")] }]);
    });

    test("ordered, unordered and nested lists", () => {
        assert.deepEqual(markdownToBlocks("3. a\n4. b\n   - c"), [{
            type: "list", ordered: true, start: 3, items: [
                [p(t("a"))],
                [p(t("b")), { type: "list", ordered: false, start: null, items: [[p(t("c"))]] }],
            ],
        }]);
    });

    test("task-list boxes survive as text", () => {
        assert.deepEqual(markdownToBlocks("- [x] done\n- [ ] open"), [{
            type: "list", ordered: false, start: null, items: [[p(t("[x] done"))], [p(t("[ ] open"))]],
        }]);
    });

    test("fenced code keeps its text and language exactly", () => {
        const code = "GET /?q=' OR 1=1-- HTTP/1.1\n<script>alert(1)</script>";
        assert.deepEqual(markdownToBlocks("```http\n" + code + "\n```"), [{ type: "codeBlock", lang: "http", text: code }]);
        assert.deepEqual(markdownToBlocks("    indented"), [{ type: "codeBlock", lang: null, text: "indented" }]);
    });

    test("quotes and rules", () => {
        assert.deepEqual(markdownToBlocks("> quoted\n\n---"), [
            { type: "quote", children: [p(t("quoted"))] },
            { type: "rule" },
        ]);
    });

    test("tables keep alignment, header and rows", () => {
        assert.deepEqual(markdownToBlocks("| Host | Port |\n|:--|--:|\n| a | `443` |"), [{
            type: "table",
            align: ["left", "right"],
            header: [[t("Host")], [t("Port")]],
            rows: [[[t("a")], [{ type: "code", text: "443" }]]],
        }]);
    });

    describe("links", () => {
        test("http, https and mailto are kept", () => {
            assert.deepEqual(markdownToBlocks("[OWASP](https://owasp.org) <mailto:a@b.c>"), [p(
                { type: "link", url: "https://owasp.org", children: [t("OWASP")] }, t(" "),
                { type: "link", url: "mailto:a@b.c", children: [t("mailto:a@b.c")] },
            )]);
        });

        test("bare URLs become links", () => {
            assert.deepEqual(markdownToBlocks("see https://example.com/x"), [p(
                t("see "), { type: "link", url: "https://example.com/x", children: [t("https://example.com/x")] },
            )]);
        });

        test("reference links resolve", () => {
            assert.deepEqual(markdownToBlocks("[CWE-89][cwe]\n\n[cwe]: https://cwe.mitre.org/data/definitions/89.html"), [p(
                { type: "link", url: "https://cwe.mitre.org/data/definitions/89.html", children: [t("CWE-89")] },
            )]);
        });

        test("any other scheme becomes plain text", () => {
            for (const url of ["javascript:alert(1)", "file:///etc/passwd", "/relative", "data:text/html,x"]) {
                assert.deepEqual(markdownToBlocks(`[click](${url})`), [p(t("click"))], url);
            }
        });
    });

    describe("nothing outside the closed set gets through", () => {
        test("inline HTML is kept as literal text", () => {
            assert.deepEqual(markdownToBlocks("payload <script>alert(1)</script> worked"),
                [p(t("payload <script>alert(1)</script> worked"))]);
        });

        test("block HTML is kept as literal text, newlines as breaks", () => {
            assert.deepEqual(markdownToBlocks("<div onclick=\"x()\">\nhi\n</div>"),
                [p(t("<div onclick=\"x()\">"), br, t("hi"), br, t("</div>"))]);
        });

        test("images become their alt text", () => {
            assert.deepEqual(markdownToBlocks("before ![a diagram](https://x/y.png) after"), [p(t("before a diagram after"))]);
        });

        test("footnotes keep their text", () => {
            assert.deepEqual(markdownToBlocks("Claim[^1].\n\n[^1]: Source."), [
                p(t("Claim[^1].")),
                p(t("[^1]: Source.")),
            ]);
        });

        test("characters that are special to templates stay text", () => {
            const s = "# $ @ { } [ ] \\ < > & \" ' = + / ; : %";
            assert.equal(allText(markdownToBlocks("x " + s)), "x # $ @ { } [ ] \\ < > & \" ' = + / ; : %");
        });

        test("only known node types appear, however odd the input", () => {
            const blockTypes = new Set(["paragraph", "heading", "list", "codeBlock", "quote", "table", "rule"]);
            const inlineTypes = new Set(["text", "strong", "emphasis", "strike", "code", "link", "break"]);
            const walkInlines = (nodes) => nodes.forEach((n) => {
                assert.ok(inlineTypes.has(n.type), n.type);
                if (n.children) walkInlines(n.children);
            });
            const walkBlocks = (nodes) => nodes.forEach((n) => {
                assert.ok(blockTypes.has(n.type), n.type);
                if (n.type === "list") n.items.forEach(walkBlocks);
                else if (n.type === "quote") walkBlocks(n.children);
                else if (n.type === "table") [n.header, ...n.rows].flat().forEach(walkInlines);
                else if (n.children) walkInlines(n.children);
            });
            const odd = [
                "<!-- comment -->", "<?php echo 1; ?>", "***", "> > > deep\n>\n> - [x] item",
                "[x]: <> \"t\"", "| a |\n|---|", "~~~\nunterminated", "&amp; &#x3C; &nbsp;",
                "Setext\n===", "1) paren\n2) list", "\\*escaped\\*", "a  \nhard break",
            ];
            for (const input of odd) walkBlocks(markdownToBlocks(input));
        });
    });
});

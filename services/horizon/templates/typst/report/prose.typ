// Renders operator prose: the closed block/inline tree that
// src/payload/markdown.js produces (see the `block` and `inline` definitions
// in schema/report-payload.schema.json).
//
// Every string is inserted as a string, never evaluated as markup, so text
// such as `#import` or `$x$` in a finding prints literally.

#let inlines(nodes) = {
  for node in nodes {
    let t = node.type
    if t == "text" { node.text }
    else if t == "strong" { strong(inlines(node.children)) }
    else if t == "emphasis" { emph(inlines(node.children)) }
    else if t == "strike" { strike(inlines(node.children)) }
    else if t == "code" { raw(node.text) }
    else if t == "link" { link(node.url, inlines(node.children)) }
    else if t == "break" { linebreak() }
  }
}

// `depth` is the heading level operator headings sit beneath, so a "# Title"
// inside a finding is still smaller than the finding's own heading.
#let blocks(nodes, depth: 2) = {
  for node in nodes {
    let t = node.type
    if t == "paragraph" {
      par(inlines(node.children))
    } else if t == "heading" {
      heading(
        level: calc.min(depth + node.level, 6),
        outlined: false,
        numbering: none,
        inlines(node.children),
      )
    } else if t == "list" {
      let items = node.items.map(item => blocks(item, depth: depth))
      if node.ordered {
        enum(start: node.start, ..items)
      } else {
        list(..items)
      }
    } else if t == "codeBlock" {
      block(
        width: 100%,
        fill: luma(245),
        inset: 8pt,
        radius: 2pt,
        raw(node.text, block: true, lang: node.lang),
      )
    } else if t == "quote" {
      block(
        inset: (left: 10pt, y: 2pt),
        stroke: (left: 2pt + luma(180)),
        blocks(node.children, depth: depth),
      )
    } else if t == "table" {
      let columns = calc.max(node.header.len(), 1)
      let align-of(a) = if a == "center" { center } else if a == "right" { right } else { left }
      table(
        columns: columns,
        align: (x, y) => align-of(node.align.at(x, default: none)),
        stroke: 0.5pt + luma(180),
        table.header(..node.header.map(cell => strong(inlines(cell)))),
        ..node.rows.map(row => {
          // A GFM row can have fewer cells than the header; pad it.
          let cells = row.map(cell => inlines(cell))
          cells + range(columns - cells.len()).map(_ => [])
        }).flatten(),
      )
    } else if t == "rule" {
      line(length: 100%, stroke: 0.5pt + luma(180))
    }
  }
}

// Prose that may be null in the payload.
#let prose(value, depth: 2) = if value != none { blocks(value, depth: depth) }

// Neutral, unbranded penetration test report.
//
// Input: a report payload (schema/report-payload.schema.json), passed as a
// path with `--input payload=/path/to/payload.json`. The path is absolute
// from the compile root, and finding images are resolved beside it.
//
// Standalone, from services/horizon:
//
//   typst compile --root . --ignore-system-fonts \
//     --input payload=/test/fixtures/kitchen-sink/payload.json \
//     templates/typst/report/main.typ report.pdf
//
// A branded template is a copy of this directory: the payload is the only
// contract between a template and horizon.
//
// Only the fonts embedded in Typst are used (Libertinus Serif, New Computer
// Modern, DejaVu Sans Mono), so output is the same on every host. They do not
// cover CJK scripts; add fonts through TYPST_FONT_PATHS if reports need them.

#import "prose.typ": prose, inlines

#let payload-path = sys.inputs.at("payload", default: "/payload.json")
#let data-dir = payload-path.split("/").slice(0, -1).join("/")
#let data = json(payload-path)
#let report = data.report
#let engagement = data.engagement
#let customer = engagement.customer

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

#let severities = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
#let severity-color = (
  CRITICAL: rgb("#7f1d1d"),
  HIGH: rgb("#b45309"),
  MEDIUM: rgb("#a16207"),
  LOW: rgb("#1e40af"),
)
#let titlecase(s) = if s == none { none } else {
  s.split("_").map(w => upper(w.first()) + lower(w.slice(1))).join(" ")
}

// Payload dates are ISO 8601 UTC ("2026-02-01T00:00:00.000Z").
#let date(iso) = if iso == none { none } else {
  datetime(
    year: int(iso.slice(0, 4)),
    month: int(iso.slice(5, 7)),
    day: int(iso.slice(8, 10)),
  ).display("[month repr:long] [day padding:none], [year]")
}

#let badge(severity) = box(
  fill: severity-color.at(severity),
  inset: (x: 5pt, y: 2pt),
  radius: 2pt,
  text(fill: white, size: 8pt, weight: "bold", tracking: 0.5pt, severity),
)

#let field(label, value) = if value != none and value != () {
  block(below: 0.8em, {
    text(weight: "bold", label)
    linebreak()
    value
  })
}

#let findings-by-id = data.findings.map(f => (f.id, f)).to-dict()
// The payload lists findings in reading order, so numbering follows the
// writer's ordering without being stored anywhere.
#let finding-number = data.findings.enumerate().map(((i, f)) => (f.id, i + 1)).to-dict()
#let count(severity) = data.findings.filter(f => f.severity == severity).len()

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

#set document(title: report.title, author: if engagement.organization != none { engagement.organization } else { () })
#set text(font: "Libertinus Serif", size: 10.5pt, lang: "en")
#show raw: set text(font: "DejaVu Sans Mono", size: 8.5pt)
#set par(justify: true, leading: 0.62em)
#set heading(numbering: "1.1")
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  set text(size: 17pt)
  block(below: 1em, it)
}
#show link: underline
#set figure(gap: 0.8em)
#show figure.caption: set text(size: 9pt)

#set page(
  paper: "a4",
  margin: (x: 2.2cm, top: 2.5cm, bottom: 2.2cm),
  header: context if counter(page).get().first() > 1 {
    set text(size: 8.5pt, fill: luma(90))
    grid(
      columns: (1fr, 1fr),
      align(left, if customer.name != none { customer.name } else { report.title }),
      align(right, report.classification),
    )
  },
  footer: context if counter(page).get().first() > 1 {
    set text(size: 8.5pt, fill: luma(90))
    align(center)[Page #counter(page).display() of #counter(page).final().first()]
  },
)

// Title page ----------------------------------------------------------------

#page(header: none, footer: none, {
  v(1fr)
  text(size: 10pt, tracking: 1.5pt, fill: luma(90), upper(report.classification))
  v(0.6em)
  par(justify: false, text(size: 26pt, weight: "bold", hyphenate: false, report.title))
  v(0.4em)
  if customer.name != none { text(size: 14pt, [Prepared for #customer.name]) }
  v(2em)
  set text(size: 10pt)
  grid(
    columns: (auto, 1fr),
    column-gutter: 1.5em,
    row-gutter: 0.7em,
    ..(
      ([Engagement], engagement.name),
      ([Type], titlecase(engagement.type)),
      ([Period], {
        date(engagement.startDate)
        if engagement.endDate != none [ – #date(engagement.endDate)]
      }),
      ([Prepared by], engagement.organization),
      ([Version], report.version),
      ([Date], date(data.generatedAt)),
    ).filter(row => row.at(1) != none and row.at(1) != "").flatten(),
  )
  v(2fr)
})

#outline(depth: 2, indent: auto)

// Executive summary -------------------------------------------------------------

= Executive Summary

#prose(report.executiveSummary)

#let total = data.findings.len()
#let most = calc.max(1, ..severities.map(count))

#figure(
  kind: table,
  caption: [Findings by severity],
  table(
    columns: (auto, auto, 1fr),
    align: (left, right, left),
    stroke: none,
    inset: (x: 6pt, y: 4pt),
    table.header([*Severity*], [*Count*], []),
    table.hline(stroke: 0.5pt),
    ..severities.map(s => (
      badge(s),
      str(count(s)),
      box(width: 100% * count(s) / most, height: 8pt, fill: severity-color.at(s)),
    )).flatten(),
    table.hline(stroke: 0.5pt),
    [*Total*], [*#total*], [],
  ),
)

// Scope --------------------------------------------------------------------------

#if engagement.scope.len() > 0 [
  = Scope

  #let scope-table(rows) = table(
    columns: (auto, 1fr, auto, auto),
    align: left,
    stroke: 0.5pt + luma(180),
    table.header([*Asset*], [*Description*], [*Type*], [*Criticality*]),
    ..rows.map(s => (
      raw(s.address),
      {
        if s.description != none { s.description }
        if s.notes != none { linebreak(); text(size: 9pt, fill: luma(90), s.notes) }
      },
      titlecase(s.assetType),
      titlecase(s.criticality),
    )).flatten(),
  )

  #let in-scope = engagement.scope.filter(s => s.inScope)
  #let out-scope = engagement.scope.filter(s => not s.inScope)
  #if in-scope.len() > 0 {
    figure(kind: table, caption: [Assets in scope], scope-table(in-scope))
  }
  #if out-scope.len() > 0 {
    figure(kind: table, caption: [Assets explicitly out of scope], scope-table(out-scope))
  }
]

// Methodology ------------------------------------------------------------------

#if report.methodology != none or report.toolsAndTechniques != none or engagement.methodology != none [
  = Methodology

  #if engagement.methodology != none [
    Testing approach: *#titlecase(engagement.methodology)*.
  ]

  #prose(report.methodology)

  #if report.toolsAndTechniques != none [
    == Tools and Techniques
    #prose(report.toolsAndTechniques, depth: 3)
  ]
]

// Body, in the writer's order -------------------------------------------------------

#let render-finding(f) = {
  heading(level: 2, [Finding #finding-number.at(f.id): #f.title])
  block(below: 1em, {
    badge(f.severity)
    for tag in f.tags {
      h(4pt)
      box(stroke: 0.5pt + luma(150), inset: (x: 4pt, y: 2pt), radius: 2pt, text(size: 8pt, tag))
    }
  })
  field([Affected systems], if f.affectedSystems.len() > 0 {
    list(..f.affectedSystems.map(raw))
  })
  field([Description], prose(f.description, depth: 3))
  field([Impact], prose(f.impact, depth: 3))
  for img in f.images {
    figure(
      image(data-dir + "/" + img.path, width: 90%),
      caption: {
        if img.title != none { strong(img.title) }
        if img.title != none and img.caption != none [. ]
        if img.caption != none { img.caption }
      },
    )
  }
  field([Recommendation], prose(f.recommendation, depth: 3))
  field([References], if f.references.len() > 0 {
    list(..f.references.map(r => if r.starts-with("http://") or r.starts-with("https://") { link(r) } else { r }))
  })
}

#if data.sections.len() > 0 [
  = Findings and Observations

  #for section in data.sections {
    if section.type == "FINDING" {
      render-finding(findings-by-id.at(section.findingId))
    } else {
      if section.title != none { heading(level: 2, section.title) }
      prose(section.content, depth: 3)
    }
  }
]

// Conclusion --------------------------------------------------------------------

#if report.conclusion != none [
  = Conclusion

  #prose(report.conclusion)
]

// Appendix: finding index --------------------------------------------------------

#if data.findings.len() > 0 [
  #set heading(numbering: "A.1")
  #counter(heading).update(0)
  = Finding Index

  #table(
    columns: (auto, 1fr, auto),
    stroke: 0.5pt + luma(180),
    align: left,
    table.header([*\#*], [*Finding*], [*Severity*]),
    ..data.findings.enumerate().map(((i, f)) => (str(i + 1), f.title, badge(f.severity))).flatten(),
  )
]

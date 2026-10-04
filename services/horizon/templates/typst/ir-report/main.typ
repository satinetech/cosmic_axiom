// Neutral, unbranded incident response report.
//
// Input: a report payload (schema/report-payload.schema.json) whose
// engagement.profile is INCIDENT_RESPONSE, so `incident` is present. It is
// passed as for the pentest template:
//
//   typst compile --root . --ignore-system-fonts \
//     --input payload=/test/fixtures/ir-kitchen-sink/payload.json \
//     templates/typst/ir-report/main.typ report.pdf
//
// Markdown rendering is shared with the pentest template (../report/prose.typ),
// so a copy of this directory for branding needs that file beside it too.

#import "../report/prose.typ": prose, inlines

#let payload-path = sys.inputs.at("payload", default: "/payload.json")
#let data-dir = payload-path.split("/").slice(0, -1).join("/")
#let data = json(payload-path)
#let report = data.report
#let engagement = data.engagement
#let customer = engagement.customer
#let incident = if data.at("incident", default: none) != none { data.incident } else {
  (timeline: (), indicators: (), assets: (), decisions: (), actions: ())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

#let severity-color = (
  CRITICAL: rgb("#7f1d1d"),
  HIGH: rgb("#b45309"),
  MEDIUM: rgb("#a16207"),
  LOW: rgb("#1e40af"),
)
#let status-color = (
  CONFIRMED_COMPROMISED: rgb("#7f1d1d"),
  SUSPECTED: rgb("#b45309"),
  CONTAINED: rgb("#a16207"),
  REMEDIATED: rgb("#166534"),
  NOT_AFFECTED: luma(110),
)
#let confidence-color = (
  CONFIRMED: rgb("#1f2937"),
  LIKELY: rgb("#4b5563"),
  POSSIBLE: rgb("#9ca3af"),
)
#let titlecase(s) = if s == none { none } else {
  s.split("_").map(w => upper(w.first()) + lower(w.slice(1))).join(" ")
}
#let present(v) = v != none and v != "" and v != ()

// Payload dates are ISO 8601 UTC ("2026-02-01T13:42:10.000Z").
#let parse(iso) = datetime(
  year: int(iso.slice(0, 4)),
  month: int(iso.slice(5, 7)),
  day: int(iso.slice(8, 10)),
  hour: int(iso.slice(11, 13)),
  minute: int(iso.slice(14, 16)),
  second: int(iso.slice(17, 19)),
)
#let date(iso) = if iso == none { none } else {
  parse(iso).display("[month repr:long] [day padding:none], [year]")
}
// Incident times are always UTC, to the minute. `stamp` is for columns
// already headed "UTC".
#let stamp(iso) = if iso == none { none } else {
  parse(iso).display("[year]-[month]-[day] [hour]:[minute]")
}
#let when(iso) = if iso == none { none } else { stamp(iso) + " UTC" }
#let indicator-types = (
  IP: "IP address", DOMAIN: "Domain", URL: "URL", EMAIL: "Email address",
  HASH_MD5: "MD5", HASH_SHA1: "SHA-1", HASH_SHA256: "SHA-256",
  FILE_NAME: "File name", ACCOUNT: "Account", OTHER: "Other",
)

#let pill(fill, label) = box(
  fill: fill,
  inset: (x: 5pt, y: 2pt),
  radius: 2pt,
  text(fill: white, size: 7.5pt, weight: "bold", tracking: 0.4pt, label),
)
#let badge(severity) = pill(severity-color.at(severity), severity)
#let status(s) = pill(status-color.at(s), upper(titlecase(s)))
#let confidence(c) = text(size: 8.5pt, fill: confidence-color.at(c), weight: if c == "CONFIRMED" { "bold" } else { "regular" }, titlecase(c))
#let muted(body) = text(size: 9pt, fill: luma(90), body)

#let field(label, value) = if present(value) {
  block(below: 0.8em, {
    text(weight: "bold", label)
    linebreak()
    value
  })
}

#let findings-by-id = data.findings.map(f => (f.id, f)).to-dict()
#let finding-number = data.findings.enumerate().map(((i, f)) => (f.id, i + 1)).to-dict()

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
#set table(stroke: 0.5pt + luma(180), inset: (x: 5pt, y: 4pt))
#show table: set text(size: 9pt)
#show table: set par(justify: false)

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
      ([Type], [Incident response]),
      ([Period], {
        date(engagement.startDate)
        if engagement.endDate != none [ – #date(engagement.endDate)]
      }),
      ([Prepared by], engagement.organization),
      ([Version], report.version),
      ([Date], date(data.generatedAt)),
    ).filter(row => present(row.at(1))).flatten(),
  )
  v(2fr)
})

#outline(depth: 2, indent: auto)

// Executive summary -------------------------------------------------------------

= Executive Summary

#prose(report.executiveSummary)

// The facts a reader looks for first, taken from the records rather than
// restated by hand.
#let first-event = if incident.timeline.len() > 0 { incident.timeline.first() } else { none }
#let last-event = if incident.timeline.len() > 0 { incident.timeline.last() } else { none }
#let compromised = incident.assets.filter(a => a.status in ("CONFIRMED_COMPROMISED", "SUSPECTED"))
#let contained = incident.assets.filter(a => a.status in ("CONTAINED", "REMEDIATED"))
#let containment = incident.assets.filter(a => a.containedAt != none).map(a => a.containedAt).sorted()

#let glance = (
  ([First recorded activity], when(if first-event != none { first-event.occurredAt })),
  ([Latest recorded activity], when(if last-event != none { last-event.occurredAt })),
  ([First containment], when(if containment.len() > 0 { containment.first() })),
  ([Assets still compromised or suspected], if incident.assets.len() > 0 { str(compromised.len()) }),
  ([Assets contained or remediated], if incident.assets.len() > 0 { str(contained.len()) }),
  ([Indicators of compromise], if incident.indicators.len() > 0 { str(incident.indicators.len()) }),
  ([Findings], if data.findings.len() > 0 { str(data.findings.len()) }),
).filter(row => present(row.at(1)))

#if glance.len() > 0 {
  figure(
    kind: table,
    caption: [Incident at a glance],
    table(
      columns: (auto, 1fr),
      stroke: none,
      align: (left, left),
      table.hline(stroke: 0.5pt),
      ..glance.map(((k, v)) => (strong(k), v)).flatten(),
      table.hline(stroke: 0.5pt),
    ),
  )
}

// Timeline ---------------------------------------------------------------------

#if incident.timeline.len() > 0 [
  = Timeline

  Times are in UTC. Confidence says how well the evidence supports each event:
  _confirmed_ events are directly evidenced, _likely_ and _possible_ ones are
  inferred.

  #table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header([*Time (UTC)*], [*Event*], [*Confidence*]),
    ..incident.timeline.map(e => (
      text(size: 8.5pt, stamp(e.occurredAt)),
      {
        strong(e.title)
        if e.tactic != none { h(4pt); muted[· #e.tactic] }
        if e.detail != none { block(above: 0.4em, prose(e.detail, depth: 3)) }
        if e.source != none { block(above: 0.3em, muted[Source: #e.source]) }
      },
      confidence(e.confidence),
    )).flatten(),
  )
]

// Findings, in the writer's order --------------------------------------------------

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
  = Findings

  #for section in data.sections {
    if section.type == "FINDING" {
      render-finding(findings-by-id.at(section.findingId))
    } else {
      if section.title != none { heading(level: 2, section.title) }
      prose(section.content, depth: 3)
    }
  }
]

// Affected assets ------------------------------------------------------------------

#if incident.assets.len() > 0 [
  = Affected Assets

  Listed worst first. An asset is _contained_ when the attacker can no longer
  use it, and _remediated_ once it has been restored to a trusted state.

  #table(
    columns: (1fr, auto, auto, auto),
    align: left,
    table.header([*Asset*], [*Status*], [*Compromised*], [*Contained*]),
    ..incident.assets.map(a => (
      {
        raw(a.identifier)
        h(4pt)
        muted(titlecase(a.kind))
        if a.description != none { block(above: 0.3em, a.description) }
      },
      status(a.status),
      text(size: 8.5pt, if a.firstCompromisedAt != none { when(a.firstCompromisedAt) } else [—]),
      text(size: 8.5pt, if a.containedAt != none { when(a.containedAt) } else [—]),
    )).flatten(),
  )
]

// Decisions and actions ----------------------------------------------------------------

#if incident.decisions.len() > 0 or incident.actions.len() > 0 [
  = Decisions and Actions

  #if incident.decisions.len() > 0 [
    == Decisions

    Choices that changed the course of the response, with who approved them.

    #table(
      columns: (auto, 1fr, auto),
      align: left,
      table.header([*Time (UTC)*], [*Decision*], [*Approved by*]),
      ..incident.decisions.map(d => (
        text(size: 8.5pt, stamp(d.occurredAt)),
        {
          prose(d.summary, depth: 3)
          if d.operator != none { muted[Recorded by #d.operator] }
        },
        d.approvedBy,
      )).flatten(),
    )
  ]

  #if incident.actions.len() > 0 [
    == Actions

    #table(
      columns: (auto, 1fr, auto),
      align: left,
      table.header([*Time (UTC)*], [*Action*], [*By*]),
      ..incident.actions.map(a => (
        text(size: 8.5pt, stamp(a.occurredAt)),
        {
          prose(a.summary, depth: 3)
          if a.targetAddress != none { muted[Target: #raw(a.targetAddress)] }
        },
        if a.operator != none { a.operator } else [—],
      )).flatten(),
    )
  ]
]

// Conclusion --------------------------------------------------------------------

#if report.conclusion != none [
  = Conclusion

  #prose(report.conclusion)
]

// Appendix: indicators of compromise ----------------------------------------------

#if incident.indicators.len() > 0 [
  #set heading(numbering: "A.1")
  #counter(heading).update(0)
  = Indicators of Compromise

  Values are shown as recorded, not defanged. Handle this appendix
  accordingly: links and addresses in it are live.

  #table(
    columns: (auto, 1fr, auto),
    align: left,
    table.header([*Type*], [*Value*], [*Confidence*]),
    ..incident.indicators.map(i => (
      text(size: 8.5pt, indicator-types.at(i.type)),
      {
        // Monospace text only breaks at spaces, so long values (URLs,
        // hashes) get break opportunities. They copy out with zero-width
        // spaces in them; the case workspace exports the clean values.
        raw(if i.value.len() > 40 { i.value.clusters().join(sym.zws) } else { i.value })
        if i.description != none { block(above: 0.3em, muted(i.description)) }
        if i.firstSeen != none or i.lastSeen != none {
          block(above: 0.3em, muted({
            [Seen ]
            if i.firstSeen != none { when(i.firstSeen) }
            if i.firstSeen != none and i.lastSeen != none [ – ]
            if i.lastSeen != none { when(i.lastSeen) }
          }))
        }
      },
      confidence(i.confidence),
    )).flatten(),
  )
]

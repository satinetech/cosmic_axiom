# Typst report templates

Used when horizon runs with `REPORT_RENDERER=typst`. Each subdirectory here is a template whose entry point is `main.typ`. `report/` is the neutral built-in one.

## The contract

A template receives one input, `payload`: the path of a JSON file described by [`schema/report-payload.schema.json`](../../schema/report-payload.schema.json).

```typst
#let data = json(sys.inputs.payload)
```

- Dates are ISO 8601 UTC strings, and enums keep their database spelling (`CRITICAL`, `WEB_APP_PENTEST`). Nothing is pre-formatted or pre-counted, so formatting and totals are the template's choice.
- `sections` is the report body in reading order. Finding sections carry a `findingId` into `findings`, and `findings` lists each finding once, in the order it first appears.
- Operator prose (summaries, finding descriptions and so on) is a block/inline tree, not a string. `report/prose.typ` renders it, and other templates can import it.
- Image `path`s are relative to the payload file: `image(dir + "/" + img.path)`, where `dir` is the payload path without its file name.

## Writing your own

Copy `report/` and change it. The payload is the only thing a template depends on. Use the fixtures to compile it without running anything else, from `services/horizon`:

```sh
typst compile --root . --ignore-system-fonts \
  --input payload=/test/fixtures/kitchen-sink/payload.json \
  templates/typst/report/main.typ report.pdf
```

To use templates kept outside this repository, point horizon at their directory:

| Variable | Default | Meaning |
|---|---|---|
| `TYPST_TEMPLATES_DIR` | this directory | A directory of templates, one per subdirectory |
| `TYPST_TEMPLATE` | `report` | The subdirectory to use |
| `TYPST_FONT_PATHS` | — | Extra font directories, separated by `:` |

horizon checks at startup that `$TYPST_TEMPLATES_DIR/$TYPST_TEMPLATE/main.typ` exists.

When a report is rendered, the whole templates directory is copied into a scratch directory, and Typst runs with that as its root. So a template can import shared files from a sibling directory, for example `#import "../brand/lib.typ": *`, but it can read nothing outside the templates directory and the report's own data. Symbolic links are copied as the files they point to.

## Fonts

Only fonts embedded in Typst are available by default: Libertinus Serif, New Computer Modern and DejaVu Sans Mono. That keeps output identical on every host, but none of them covers CJK scripts. Add fonts with `TYPST_FONT_PATHS`, or vendor them inside the template directory and pass that directory in `TYPST_FONT_PATHS`.

## Changing the built-in template

`npm test` compares every page of both fixtures against the images in `test/golden/`. After an intended change, run `npm run golden` and commit the new images, so reviewers see the change page by page.

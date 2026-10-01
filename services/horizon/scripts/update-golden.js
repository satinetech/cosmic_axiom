// Regenerate test/golden/<fixture>/page-N.png with the installed Typst.
import fs from "fs";
import path from "path";
import { fixtureNames } from "../test/fixtures/index.js";
import { GOLDEN_DIR, installedTypstVersion, pngs, renderPages } from "../test/golden/index.js";

const version = installedTypstVersion();
if (!version) {
    console.error("typst not found; install it or set TYPST_BIN");
    process.exit(1);
}

for (const fixture of fixtureNames()) {
    const target = path.join(GOLDEN_DIR, fixture);
    const rendered = renderPages(fixture);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target);
    for (const page of pngs(rendered)) fs.copyFileSync(path.join(rendered, page), path.join(target, page));
    fs.rmSync(rendered, { recursive: true, force: true });
    console.log(`${fixture}: ${pngs(target).length} page(s)`);
}
fs.writeFileSync(path.join(GOLDEN_DIR, "TYPST_VERSION"), `${version}\n`);
console.log(`made with typst ${version}`);

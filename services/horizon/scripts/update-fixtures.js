// Regenerate payload.json and images/ for every fixture in test/fixtures.
import fs from "fs";
import path from "path";
import { FIXTURES_DIR, buildFixture, fixtureNames } from "../test/fixtures/index.js";

for (const name of fixtureNames()) {
    const dir = path.join(FIXTURES_DIR, name);
    const { json, assets } = buildFixture(name);
    fs.rmSync(path.join(dir, "images"), { recursive: true, force: true });
    fs.writeFileSync(path.join(dir, "payload.json"), json);
    for (const asset of assets) {
        fs.mkdirSync(path.dirname(path.join(dir, asset.path)), { recursive: true });
        fs.writeFileSync(path.join(dir, asset.path), asset.data);
    }
    console.log(`${name}: payload.json${assets.length ? ` + ${assets.length} image(s)` : ""}`);
}

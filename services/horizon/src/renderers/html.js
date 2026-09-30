import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { v4 as uuidv4 } from "uuid";

/**
 * The HTML renderer: an HTML document in, a PDF file out.
 *
 * The shape every renderer shares -- a document and its options in, the name
 * of a file in `outputDir` out -- so that the document-building code in
 * services/generateReport.js does not care how the PDF is produced.
 *
 * Writes to a temporary name first and renames into place, so a client that
 * polls for `filename` never sees a half-written file. `filename` reuses an
 * existing name (regenerating a document in place); without one a fresh name
 * is minted, starting with `prefix`.
 *
 * @param {object} args
 * @param {string} args.html        complete HTML document
 * @param {object} args.pdf         Puppeteer page.pdf() options, minus `path`
 * @param {string} args.outputDir   directory the PDF is written to
 * @param {string} [args.filename]  reuse this name instead of minting one
 * @param {string} [args.prefix]    prefix for a minted name, e.g. "briefing-"
 * @returns {Promise<string>} the file name within outputDir
 */
export async function renderHtml({ html, pdf, outputDir, filename = null, prefix = "" }) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const name = filename || `${prefix}${uuidv4()}.pdf`;
    const tempFilepath = path.join(outputDir, `temp-${prefix}${uuidv4()}.pdf`);

    await page.pdf({ ...pdf, path: tempFilepath });

    await browser.close();

    fs.renameSync(tempFilepath, path.join(outputDir, name));

    return name;
}

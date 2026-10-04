import { generatePdf, generateBriefingPdf, generateRoePdf } from "../services/generateReport.js";
import { buildPayload, PayloadError } from "../payload/buildPayload.js";
import { BUILTIN_TEMPLATES_DIR, renderTypst, resolveTemplate, TypstError } from "../renderers/typst.js";
import fs from "fs";
import path from "path";

// Which renderer produces the main report: "html" (Puppeteer, the default) or
// "typst". Briefings and RoEs always use HTML.
const REPORT_RENDERER = (process.env.REPORT_RENDERER || "html").toLowerCase();
if (!["html", "typst"].includes(REPORT_RENDERER)) {
    throw new Error(`REPORT_RENDERER must be "html" or "typst", not "${process.env.REPORT_RENDERER}"`);
}

// The Typst template: TYPST_TEMPLATES_DIR is a directory of templates (the
// built-in templates/typst by default), TYPST_TEMPLATE the one to use.
const TYPST_TEMPLATES_DIR = path.resolve(process.env.TYPST_TEMPLATES_DIR || BUILTIN_TEMPLATES_DIR);
const TYPST_TEMPLATE = process.env.TYPST_TEMPLATE || "report";
if (REPORT_RENDERER === "typst") {
    resolveTemplate(TYPST_TEMPLATES_DIR, TYPST_TEMPLATE);
}

// Incident response reports exist only as a Typst template, whatever
// REPORT_RENDERER says. A templates directory with its own "ir-report" brands
// them too; otherwise the built-in one is used.
const IR_TEMPLATE = "ir-report";
const IR_TEMPLATES_DIR = hasTemplate(TYPST_TEMPLATES_DIR, IR_TEMPLATE) ? TYPST_TEMPLATES_DIR : BUILTIN_TEMPLATES_DIR;
resolveTemplate(IR_TEMPLATES_DIR, IR_TEMPLATE);

function hasTemplate(dir, name) {
    try {
        resolveTemplate(dir, name);
        return true;
    } catch {
        return false;
    }
}

const isIncidentResponse = (engagement) => engagement?.profile === "INCIDENT_RESPONSE";

async function generateTypstPdf({ report, engagement, incident, existingFilename }) {
    const { payload, assets } = buildPayload({ report, engagement, incident });
    const ir = isIncidentResponse(engagement);
    return renderTypst({
        payload,
        assets,
        outputDir: path.resolve("generated"),
        filename: existingFilename,
        templatesDir: ir ? IR_TEMPLATES_DIR : TYPST_TEMPLATES_DIR,
        template: ir ? IR_TEMPLATE : TYPST_TEMPLATE,
    });
}

export const generatePdfReport = async (req, res) => {
    const { report, engagement, incident, existingFilename } = req.body;

    if (!report || !engagement) {
        return res.status(400).json({ error: "Missing report, engagement, or sections data" });
    }

    try {
        // Step 1: Generate the PDF using provided data
        const typst = REPORT_RENDERER === "typst" || isIncidentResponse(engagement);
        const generate = typst ? generateTypstPdf : generatePdf;
        const filePath = await generate({ report, engagement, incident, existingFilename });

        // Step 2: Return the path to the generated file
        res.status(200).json({ url: `/generated/${filePath}` });
    } catch (err) {
        if (err instanceof PayloadError) {
            // Something in the report itself needs fixing; say what.
            return res.status(422).json({ error: "The report data cannot be rendered", field: err.path, detail: err.message });
        }
        if (err instanceof TypstError) {
            console.error("Typst failed:", err.message, err.output);
            return res.status(500).json({
                error: "The report template failed to compile. This is a problem with the template, not with the report content.",
                diagnostics: err.diagnostics,
            });
        }
        console.error("Failed to generate PDF:", err.message);
        res.status(500).json({ error: "PDF generation failed" });
    }
};

export const generateBriefingReport = async (req, res) => {
    const { report, engagement, existingFilename } = req.body;

    if (!report || !engagement) {
        return res.status(400).json({ error: "Missing report or engagement data" });
    }

    try {
        // Generate the briefing PDF using provided data
        const filePath = await generateBriefingPdf({ report, engagement, existingFilename });

        // Return the path to the generated file
        res.status(200).json({ url: `/generated/${filePath}` });
    } catch (err) {
        console.error("Failed to generate briefing PDF:", err.message);
        res.status(500).json({ error: "Briefing PDF generation failed" });
    }
};

export const generateRoeReport = async (req, res) => {
    const { roe, engagement, existingFilename } = req.body;

    if (!roe || !engagement) {
        return res.status(400).json({ error: "Missing roe or engagement data" });
    }

    try {
        // Generate the RoE PDF using provided data
        const filePath = await generateRoePdf({ roe, engagement, existingFilename });

        // Return the path to the generated file
        res.status(200).json({ url: `/generated/${filePath}`, filename: filePath });
    } catch (err) {
        console.error("Failed to generate RoE PDF:", err.message);
        res.status(500).json({ error: "RoE PDF generation failed" });
    }
};

export const deleteFile = async (req, res) => {
    const { filename } = req.params;
    
    if (!filename || !filename.endsWith('.pdf')) {
        return res.status(400).json({ error: "Invalid filename" });
    }
    
    try {
        const outputDir = path.resolve("generated");
        const filepath = path.join(outputDir, filename);
        
        // Check if file exists and delete it
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            res.json({ message: "File deleted successfully" });
        } else {
            res.status(404).json({ error: "File not found" });
        }
    } catch (err) {
        console.error("Failed to delete file:", err.message);
        res.status(500).json({ error: "File deletion failed" });
    }
};

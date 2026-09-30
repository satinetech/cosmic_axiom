import { generatePdf, generateBriefingPdf, generateRoePdf } from "../services/generateReport.js";
import { buildPayload, PayloadError } from "../payload/buildPayload.js";
import { renderTypst, TypstError } from "../renderers/typst.js";
import fs from "fs";
import path from "path";

// Which renderer produces the main report: "html" (Puppeteer, the default) or
// "typst". Briefings and RoEs always use HTML.
const REPORT_RENDERER = (process.env.REPORT_RENDERER || "html").toLowerCase();
if (!["html", "typst"].includes(REPORT_RENDERER)) {
    throw new Error(`REPORT_RENDERER must be "html" or "typst", not "${process.env.REPORT_RENDERER}"`);
}

async function generateTypstPdf({ report, engagement, existingFilename }) {
    const { payload, assets } = buildPayload({ report, engagement });
    return renderTypst({ payload, assets, outputDir: path.resolve("generated"), filename: existingFilename });
}

export const generatePdfReport = async (req, res) => {
    const { report, engagement, existingFilename } = req.body;

    if (!report || !engagement) {
        return res.status(400).json({ error: "Missing report, engagement, or sections data" });
    }

    try {
        // Step 1: Generate the PDF using provided data
        const generate = REPORT_RENDERER === "typst" ? generateTypstPdf : generatePdf;
        const filePath = await generate({ report, engagement, existingFilename });

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

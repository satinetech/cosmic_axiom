import { Router } from "express";
import axios from "axios";
import { authenticateRequest } from "../middleware/authenticateRequest.js";

const router = Router();
const SINGULARITY_URL = process.env.SINGULARITY_URL;

// GET /images/finding/:reportFindingId - Get all images for a finding
router.get("/finding/:reportFindingId", authenticateRequest, async (req, res) => {
    try {
        const response = await axios.get(`${SINGULARITY_URL}/images/finding/${req.params.reportFindingId}`, {
            headers: { Authorization: req.headers.authorization },
        });
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching finding images:", error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: "Failed to fetch finding images" });
        }
    }
});

// POST /images - Create a new image
router.post("/", authenticateRequest, async (req, res) => {
    try {
        const response = await axios.post(`${SINGULARITY_URL}/images`, req.body, {
            headers: { Authorization: req.headers.authorization },
        });
        res.json(response.data);
    } catch (error) {
        console.error("Error creating image:", error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: "Failed to create image" });
        }
    }
});

// PUT /images/:id - Update an image
router.put("/:id", authenticateRequest, async (req, res) => {
    try {
        const response = await axios.put(`${SINGULARITY_URL}/images/${req.params.id}`, req.body, {
            headers: { Authorization: req.headers.authorization },
        });
        res.json(response.data);
    } catch (error) {
        console.error("Error updating image:", error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: "Failed to update image" });
        }
    }
});

// DELETE /images/:id - Delete an image
router.delete("/:id", authenticateRequest, async (req, res) => {
    try {
        const response = await axios.delete(`${SINGULARITY_URL}/images/${req.params.id}`, {
            headers: { Authorization: req.headers.authorization },
        });
        res.json(response.data);
    } catch (error) {
        console.error("Error deleting image:", error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: "Failed to delete image" });
        }
    }
});

export default router;
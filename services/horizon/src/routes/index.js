import { Router } from 'express';
import { generatePdfReport, generateBriefingReport, generateRoeReport, deleteFile } from '../controllers/pdfController.js';
import healthRoutes from './health.js';
import { authenticateRequest } from '../middleware/authenticateRequest.js';

const router = Router();

router.use('/health', healthRoutes);

// Every route below /health handles report content and must be authenticated.
// The gateway forwards the caller's Authorization header on each of these, so
// requiring a token here does not change the supported call path -- it closes a
// direct one that bypassed it.
router.post('/generate', authenticateRequest, generatePdfReport);
router.post('/generate-briefing', authenticateRequest, generateBriefingReport);
router.post('/generate-roe', authenticateRequest, generateRoeReport);
router.delete('/files/:filename', authenticateRequest, deleteFile);

export default router;
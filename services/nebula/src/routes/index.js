import { Router } from 'express';
import healthRoutes from './health.js';
import aiRoutes from './ai.js';
import { chatRouter } from '../chat/route.js';

const router = Router();

router.use('/health', healthRoutes);
// Ahead of /ai, whose routes would otherwise see /ai/chat first.
router.use('/ai/chat', chatRouter());
router.use('/ai', aiRoutes);

export default router;
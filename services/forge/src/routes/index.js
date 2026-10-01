import { Router } from 'express';
import customerRoutes from './customer.js';
import engagementRoutes from './engagement.js';
import healthRoutes from './health.js';
import oplogRoutes from './oplog.js';
import scopeRoutes from './scope.js';
import testingParametersRoutes from './testingParameters.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/customer', customerRoutes);
router.use('/engagement', oplogRoutes);
router.use('/engagement', engagementRoutes);
router.use('/scope', scopeRoutes);
router.use('/testing-parameters', testingParametersRoutes);

export default router;
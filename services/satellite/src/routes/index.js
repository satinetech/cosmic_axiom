import { Router } from 'express';
import customerRoutes from './customer.js';
import engagementRoutes from "./engagement.js";
import oplogRoutes from './oplog.js';
import recordsRoutes from './records.js';
import findingsRoutes from './findings.js';
import healthRoutes from './health.js';
import reportsRoutes from './reports.js';
import sectionsRoutes from './sections.js';
import userRoutes from './users.js';
import threatIntelRoutes from "./threatintel.js";
import cveRoutes from './cve.js';
import testApiRoutes from './test-api.js';
import newsRoutes from './news.js';
import scopeRoutes from './scope.js';
import imagesRoutes from './images.js';
import aiRoutes from './ai.js';
import roeRoutes from './roe.js';
import testingParametersRoutes from './testing-parameters.js';


const router = Router();

router.use('/health', healthRoutes);
router.use('/users', userRoutes);
router.use('/findings', findingsRoutes);
router.use('/customer', customerRoutes);
router.use("/engagement", oplogRoutes);
router.use("/engagement", recordsRoutes);
router.use("/engagement", engagementRoutes);
router.use('/sections', sectionsRoutes);
router.use('/reports', reportsRoutes);
router.use("/threatintel", threatIntelRoutes);
router.use('/cve', cveRoutes);
router.use('/test-api', testApiRoutes);
router.use('/news', newsRoutes);
router.use('/scope', scopeRoutes);
router.use('/images', imagesRoutes);
router.use('/ai', aiRoutes);
router.use('/roe', roeRoutes);
router.use('/testing-parameters', testingParametersRoutes);



export default router;
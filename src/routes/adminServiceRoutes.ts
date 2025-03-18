import express, { Request, Response } from 'express';
import { addService } from '../controllers/adminServiceController';
import { isAdmin } from '../middleware/authMiddleware';

const router = express.Router();

// Admin route to add a service
router.post('/add-service', isAdmin, addService);

module.exports = router;

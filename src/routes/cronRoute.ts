import express from 'express';
import { updateExpiredRequests } from '../cronjobs/requestController';

const router = express.Router();

// Route to update expired requests
router.patch('/requests/update-expired', updateExpiredRequests);

module.exports = router;

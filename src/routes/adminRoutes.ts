import express, { Request, Response } from 'express';
import { registerAdmin, loginAdmin, refreshAdminToken, createExtension, fetchRequestsWithPagination, fetchConsultantsByExpertise, 
    createAppointment, fetchAllUsers, createTask, fetchConsultants, fetchTransactionStats, fetchUserAndConsultantStats, 
    fetchTopNewestUsers, fetchMonthlyTransactionTotals, fetchAllConsultants, createConsultant, closeIssue, fetchConsultantById,
     fetchUserDetails, fetchCompletedUserRequests, getActiveRequestForConsultant, fetchConsultantHistoryByCid, fetchAdminNotifications,
     markNotificationAsRead, suspendConsultant, deleteConsultant, updateConsultant, getAverageRatings, getTopConsultantsByRating,
    getReadyRequests, getRequestByOrderId, setRequestStatusToCompleted, fetchAppointmentsWithRequests, fetchWithdrawals, fetchDataByType,
    completeDebit, fetchWalletHistoryTotalsByCID, fetchAllWithdrawals, fetchAllDeposits, fetchTotalTransactions, fetchWithdrawalById,
  fetchDepositById, deleteCrewByUserId, deleteCompanyByUserId, deleteCrewCompanyById, getResolvesByOrderId, getAllConsultantsList,
  getEmailList, fetchAttendanceByRoom, updateVerificationStatus, updateCrewVerificationStatus, setApiVettingTrue, setCompanyApiVettingTrue,
  FailedCrewCompanyById, getContactSubmissions,
  updateMissingNfscore,
  getSingleContactSubmission,
  replyToContactSubmission} from '../controllers/adminController';
import { isAdmin } from '../middleware/authMiddleware';
import { validateUserRequestForAdmin } from '../middleware/TokenValidator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/register', registerAdmin);
router.post('/login', loginAdmin);
router.get('/admin/getaccess', refreshAdminToken);
router.post('/extension/create', createExtension);
router.get('/pullrequests', fetchRequestsWithPagination);
router.get('/consultants', fetchConsultantsByExpertise);
router.post('/create/appointment', createAppointment);
router.get('/fetch/users', fetchAllUsers);
router.post('/create/task', createTask);
router.get('/pull/consultants', fetchAllConsultants);
// Add route to fetch transaction stats
router.get('/transactions/stats', fetchTransactionStats);

router.get('/stats/user-consultants', fetchUserAndConsultantStats);

router.get('/stats/newest-users', fetchTopNewestUsers);

router.get('/fetch/consultants', getAllConsultantsList);

router.post('/create/consultants', createConsultant);

router.patch('/set/issue/:id', closeIssue);

router.get('/fetch/consultants/:id', fetchConsultantById);

router.get('/fetch/users/:id', fetchUserDetails);

router.get('/fetch/completed/user/:userId', fetchCompletedUserRequests);

router.get('/consultant/active/:id', getActiveRequestForConsultant);

router.get('/consultant/history/:cid', fetchConsultantHistoryByCid);

router.delete('/consultants/:id', deleteConsultant);

router.patch('/consultants/:id/suspend', suspendConsultant);

router.put('/admin-notifications/:id/read', markNotificationAsRead);

router.get('/admin-notifications', fetchAdminNotifications);

router.put('/consultants/:id', updateConsultant);

router.get('/feedback/average-ratings', getAverageRatings);

router.get('/consultants/top', getTopConsultantsByRating);

router.get('/request/:orderId', getRequestByOrderId);

router.get('/requests/ready', getReadyRequests);

router.patch('/request/status/completed/:orderId', setRequestStatusToCompleted);

router.get('/appointments/conversations', fetchAppointmentsWithRequests);

// Route to fetch withdrawals
router.get('/withdrawals', fetchWithdrawals);

// Route to complete a debit transaction
router.post('/debit', completeDebit);

// Route to fetch data by type (crew/company)
router.get('/join/fetchdata', fetchDataByType);

router.get('/wallet-history-totals', fetchWalletHistoryTotalsByCID);

router.get('/deposits', fetchAllDeposits);

router.get('/withdrawals', fetchAllWithdrawals);

router.get('/total-transactions', fetchTotalTransactions);

router.get('/withdrawal/:id', fetchWithdrawalById);

router.get('/deposit/:id', fetchDepositById);

router.delete("/crew/:userId", deleteCrewByUserId);

router.delete("/company/:userId", deleteCompanyByUserId);

router.delete("/crew-company/:id", deleteCrewCompanyById);

router.patch("/crew-company/:id", FailedCrewCompanyById);

router.get('/resolves/:orderId', getResolvesByOrderId);

router.get("/email-list", getEmailList);

router.get("/attendance/:roomId", fetchAttendanceByRoom);

router.patch("/crew/apiVetting/:userId", setApiVettingTrue); // Set apiVetting to true

router.patch("/crew/verify/:userId", updateCrewVerificationStatus); // Update verification status

router.patch("/company/apiVetting/:userId", setCompanyApiVettingTrue); // Set apiVetting to true

router.patch("/company/verify/:userId", updateVerificationStatus); // Update verification status

router.get('/contact-submissions', getContactSubmissions);

router.get('/contact-submissions/:id', getSingleContactSubmission);

router.post('/contact-submissions/:id/reply', replyToContactSubmission);

router.get('/fetch/user/pending-request/:id', validateUserRequestForAdmin, (req, res) => {
  // Access the request object added by the middleware
  const request = req.body.request;
  res.json({ message: 'Pending request found', request });
});

router.get('/transactions/monthly-totals', async (req: Request, res: Response) => {
    try {
    
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ message: 'Authorization token is missing or invalid' });
        }
    
        const token = authHeader.split(' ')[1];
        const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    
        if (!JWT_SECRET) {
          return res.status(500).json({ message: 'JWT secret key is not configured' });
        }
    
        let decodedToken;
        try {
          decodedToken = jwt.verify(token, JWT_SECRET);
        } catch (err) {
          return res.status(401).json({ message: 'Invalid token' });
        }
    
        // Check for admin role in the token payload
        const { role } = decodedToken as { role: string };
        if (role !== 'admin') {
          return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }
      const totals = await fetchMonthlyTransactionTotals();
      return res.status(200).json({
        message: 'Monthly transaction totals fetched successfully',
        data: totals,
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch monthly transaction totals',
        error: error,
      });
    }
  });

router.get('/profile', isAdmin, (req, res) => {
    res.json({ message: 'Access granted to protected profile route' });
});


router.put("/update-nfscore", updateMissingNfscore);
  

module.exports = router;

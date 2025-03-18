import express, { Request, Response } from 'express';
import { registerConsult, loginConsult, refreshConsultantToken, createAvailability, fetchPendingAssignmentsByUserId, acceptAssignment, declineAssignment, 
  fetchTransactionAndRequestByOrderId, getAppointmentsByConsultantId, getPreferencesByUserId, getAvailabilityByCid, 
  fetchConsultantById, updateConsultantById, fetchConsultantProfilePicById, updateConsultantProfilePic, upload,getActiveRequest, refreshToken, 
  updateConsultantPassword, requestPasswordReset, resetPassword, fetchConsultantPref, updateConsultantPreference, 
  fetchHistoryByCid, fetchAssignmentsAndRequests, fetchPendingRequestsByConsultantExpertise, completeRequest, fetchNotifications, 
  getTasksByConsultant, handleChatTransaction, uploadConsultantFiles, fetchResolveFiles, verifyEmailAndSetPassword, getWalletByCid,
  getWalletHistory, fetchDataByType, createWithdrawal, fetchWalletHistoryTotalsByCID, fetchBankDetailsByCID, createBank,
fetchWithdrawalsByCID, fetchDepositsByCID, fetchDepositById, fetchWithdrawalById, getCompletedCounts,
updateBankDetails, fetchChatSettings, updateChatSettingsStatus, createChatSettings, updateChatSoundUrl,
sendConsultantMessage,
getServiceChatMessages} from '../controllers/consultController';
import { isAdmin, isnotAdmin } from '../middleware/authMiddleware';
import { verifyConsultantToken } from '../middleware/TokenValidator';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/register', registerConsult);
router.post('/login', loginConsult);
router.get('/consultant/getaccess', refreshToken);
router.post('/createavailability', createAvailability);
router.get('/fetchrequest/:uid', fetchPendingAssignmentsByUserId);
router.put('/assignments/:uid/:assignmentId/accept', acceptAssignment);
router.put('/assignments/:uid/:assignmentId/decline', declineAssignment);
router.get('/orderdetail/:orderId', fetchTransactionAndRequestByOrderId);
router.get('/appointments/:cid', getAppointmentsByConsultantId);
router.get('/preferences/:userId', getPreferencesByUserId);
router.get('/availability/:cid', getAvailabilityByCid);
router.get('/consultant/:id', fetchConsultantById);
router.put('/update/:id', verifyConsultantToken, updateConsultantById);
router.get('/profilepic/:id', fetchConsultantProfilePicById);
router.post('/update/:id', verifyConsultantToken, upload, updateConsultantProfilePic);
router.get('/activerequest/:id', getActiveRequest);
router.get('/getaccess', refreshToken);
router.post('/updatepassword/:userId',verifyConsultantToken, updateConsultantPassword);
router.post('/forgotpassword', requestPasswordReset);
router.post('/resetpassword/:token', resetPassword);
router.get('/consultant-preferences/:userId', fetchConsultantPref);
router.put('/consultant-preferences/:userId', updateConsultantPreference);
router.get('/assignments/:cid', fetchHistoryByCid);
router.get('/conversations/:cid', fetchAssignmentsAndRequests);
router.get('/requests/expertise/:cid', fetchPendingRequestsByConsultantExpertise);
router.post('/requests/complete', completeRequest);
router.get('/fetchnotifications/:userId', fetchNotifications);
router.get('/fetchtask/:cid', getTasksByConsultant);
router.post('/newchat', handleChatTransaction);
router.post('/resolve-files', uploadConsultantFiles);
router.get('/resolve/:orderId', fetchResolveFiles);
router.post('/verify-email', verifyEmailAndSetPassword);
router.get('/wallet/:cid', getWalletByCid);
router.get('/wallet-history/:cid', getWalletHistory);
router.get("/fetch-data", fetchDataByType);
router.post("/create-withdrawal", createWithdrawal);
router.get('/banks/:cid', fetchBankDetailsByCID);
router.post('/banks', createBank);
router.get('/wallet/withdrawals/:cid', fetchWithdrawalsByCID);
router.get('/wallet/revenues/:cid', fetchDepositsByCID);
router.get('/withdrawal/:id', fetchWithdrawalById);
router.get('/deposit/:id', fetchDepositById);
router.put('/update-bank', updateBankDetails);
router.get('/completed-counts/:cid', getCompletedCounts);
router.get('/chat-settings/:cid', fetchChatSettings);
router.put('/chat-settings/:cid/status', updateChatSettingsStatus);
router.post('/chat-settings', createChatSettings);
router.put("/chatsettings/:cid/soundurl", updateChatSoundUrl);
router.post('/servicechat/consultant', sendConsultantMessage);
router.get('/servicechat/messages', getServiceChatMessages);



router.get('/wallet-history-totals', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
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

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    

    // Extract user details from the decoded token
    const { userId } = decodedToken as { userId: string };
    if (!userId) {
      return res.status(403).json({ message: "Access denied. No CID found in the token." });
    }

    const { cid } = req.query; // CID as a query parameter

    if (!cid || typeof cid !== 'string') {
      return res.status(400).json({ message: 'CID is required and must be a string.' });
    }


    if(userId !== cid){
      return res.status(400).json({ message: 'Consultant ID does not match token' });
    }

    const totals = await fetchWalletHistoryTotalsByCID(cid);
    return res.status(200).json({
      message: 'Wallet history totals fetched successfully for CID',
      cid,
      totals,
    });
  } catch (error) {
    console.error('Error fetching wallet history totals by CID:', error);
    return res.status(500).json({
      message: 'Failed to fetch wallet history totals',
      error: error,
    });
  }
});


router.get('/profile', isnotAdmin, (req, res) => {
    res.json({ message: 'Access granted to protected profile route' });
  });
  

  module.exports = router;

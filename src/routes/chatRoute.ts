import express, { Request, Response } from 'express';
import { saveMessage, fetchMessagesByRoom, uploadChatFile, getFilesByRoom, fetchMessagesAndExportCSV, fetchMessagesAndExportPDF, 
    registerFeedback, reportIssue, fetchIssuesWithUsers, fetchSingleIssueWithUser, fetchFeedbacksWithUsers, 
    fetchSingleFeedbackWithUser, createIssueThread, markNotificationAsRead,
    createOrUpdateAttendance,
    fetchAttendanceByRoom} from '../controllers/chatController';

const router = express.Router();

router.post('/save', saveMessage);
router.get('/fetchmessage/:room', fetchMessagesByRoom);
router.post('/upload', uploadChatFile); // Endpoint to upload file
router.get('/files/:room', getFilesByRoom); // Endpoint to fetch files by room
router.get('/export/:room', fetchMessagesAndExportCSV);
router.get('/exportpdf/:room', fetchMessagesAndExportPDF);
router.post('/feedback/register', registerFeedback);
router.get('/fetch/feedbacks', fetchFeedbacksWithUsers);
router.get('/fetch/feedback/:id', fetchSingleFeedbackWithUser);
router.post('/report/issue', reportIssue);
router.get('/fetch/issues', fetchIssuesWithUsers);
router.get('/fetch/issue', fetchSingleIssueWithUser);
router.post('/post/thread', createIssueThread);
router.patch('/notifications/:notificationId/read', markNotificationAsRead);
router.post("/attendance", createOrUpdateAttendance); // Create or update attendance
router.get("/attendance/:roomId", fetchAttendanceByRoom);



module.exports = router;

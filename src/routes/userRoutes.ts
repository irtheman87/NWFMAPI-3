import express, { Request, Response } from 'express';
import { registerUser, loginUser, refreshToken, updateUserById, updateUserPassword, updateUserProfilePic, fetchUserById, 
  upload, fetchUserPreferences, updatePreference, fetchUserProfilePic, 
  getAvailableHoursCount, checkTransactionStatus, fetchUserRequests, fetchCompletedRequests, 
  fetchSingleRequest, fetchAwaitingRequests,
  submitContactForm,
  sendUserMessage,
  getServiceChatMessages} from '../controllers/UserController';
import { isnotAdmin } from '../middleware/authMiddleware';
import { fetchServicesByType } from '../controllers/ServicesController';
import Transaction from '../models/SetTransaction';
import User, { IUser } from '../models/User';
import { ReadScriptTransaction, WatchFinalCutTransaction, BudgetTransaction, CreateBudgetTransaction, CreateMarketBudgetTransaction, createAPitch, createLegal, chatTransaction,
  getParameterHandler, uploadFiles, ExtendMyTime, createPitchDeckRequest,
  updateRequestTime
 } from '../controllers/TransactionController';
import { validateUserRequest, verifyUserToken } from '../middleware/TokenValidator';
import { verifyUserEmail } from '../controllers/utilityroute';
import { createAppointment } from '../services/appointmentService';
import { io, users } from '../index';
import { Time } from '../types';
import { createAdminNotification } from '../utils/UtilityFunctions';
import { requestPasswordReset, resetPassword, fetchNotificationsForUser, fetchUserUpcomingRequest, getDailyAvailability, updateRequestAndCreateAppointment, fetchUserSpecificIssues } from '../controllers/UserController';
import { request } from 'http';
import sendEmail from '../utils/sendEmail';
import RequestModel from '../models/Request';
import UserModel from '../models/UserModel';
import { uploadCharacterBible, uploadLocalFiles } from '../utils/moreUtils';

 const crypto = require('crypto');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/services/type/:type', fetchServicesByType);
// router.post('/transaction/read', verifyUserToken, uploadLocalFiles, uploadCharacterBible, ReadScriptTransaction);
router.post('/transaction/read', verifyUserToken, uploadFiles, ReadScriptTransaction);
router.post('/transaction/watch', verifyUserToken, uploadFiles,  WatchFinalCutTransaction);
router.post('/transaction/budget', verifyUserToken, uploadFiles, BudgetTransaction);
router.post('/transaction/createbudget', verifyUserToken, uploadFiles, CreateBudgetTransaction);
router.post('/transaction/marketbudget', verifyUserToken, uploadFiles, CreateMarketBudgetTransaction);
router.post('/transaction/pitch', verifyUserToken, uploadFiles, createAPitch);
router.post('/transaction/legal', verifyUserToken, uploadFiles, createLegal);
router.post('/transaction/deck', verifyUserToken, uploadFiles, createPitchDeckRequest);
router.post('/transaction/chat', verifyUserToken, uploadFiles, chatTransaction);
router.post('/updateuser/:userId',verifyUserToken, updateUserById);
router.post('/updatepassword/:userId',verifyUserToken, updateUserPassword);
router.post('/updatepic/:userId',verifyUserToken, upload, updateUserProfilePic);
router.get('/profile-user/:userId',verifyUserToken, fetchUserById);
router.get('/user-pref/:userId',verifyUserToken, fetchUserPreferences);
router.post('/update-pref/:userId', verifyUserToken, updatePreference);
router.get('/propic/:userId', verifyUserToken, fetchUserProfilePic);
router.get('/gethours/', verifyUserToken, getAvailableHoursCount);
router.post('/extendmytime', verifyUserToken, ExtendMyTime);
router.post('/forgotpassword', requestPasswordReset);
router.post('/resetpassword/:token', resetPassword);
router.get('/gettranstat/:reference', checkTransactionStatus);
router.get('/conversations/:userId', fetchUserRequests);
router.get('/requests/completed/:userId', fetchCompletedRequests);
router.get('/get-reference/:reference', getParameterHandler);
router.get('/verify/:token', verifyUserEmail);
router.get('/user/getaccess', refreshToken);
router.get('/conversation/:orderId', fetchSingleRequest);
router.get('/fetchnotifications/:userId', fetchNotificationsForUser);
router.get('/fetch/upcoming/:userId', fetchUserUpcomingRequest);
router.get('/fetch/awaiting/:userId', fetchAwaitingRequests);
router.get('/consultant/:cid/availability', getDailyAvailability);
router.post('/requests/:cid/createappointment', updateRequestAndCreateAppointment);
router.get('/issues/:uid', fetchUserSpecificIssues);
router.post('/contacted', submitContactForm);
router.post('/servicechat/user', sendUserMessage);
router.get('/servicechat/messages', getServiceChatMessages);
router.put('/continue-chat', verifyUserToken, updateRequestTime);

// Protected route example
router.get('/profile', isnotAdmin, (req, res) => {
  res.json({ message: 'Access granted to protected profile route' });
});

router.get('/user/pending-request', validateUserRequest, (req, res) => {
  // Access the request object added by the middleware
  const request = req.body.request;
  res.json({ message: 'Pending request found', request });
});

// const secret = process.env.SECRET_KEY;
// Using Express
router.post('/webhook/url', async (req: Request, res: Response) => {
  try {
    const secret = process.env.SECRET_KEY as string;

    // Validate event signature
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.sendStatus(400); // Unauthorized if signature is invalid
    }

    const event = req.body;
    console.log(event.event);

    // Handle 'charge.success' event
    if (event.event === 'charge.success') {
      const { reference, status, customer } = event.data;

      console.log(`Payment successful. Reference: ${reference}`);

      // Update transaction in the database
      const result = await Transaction.findOneAndUpdate(
        { reference }, 
        { status: 'completed' },
        { new: true }
      );

     

      if(result?.type == "Chat"){
        console.log(result?.type);
        const orderid =  result?.orderId as string;
        //fetchRequestByOrderId(orderid); 

        let request = null;

        if(result.originalOrderIdFromChat){
          request = await RequestModel.findOne({ orderId: result.originalOrderIdFromChat });
          if (!request) {
            throw new Error("Request not found"); // Handle case where request is not found
          }
        }else{
          request = await RequestModel.findOne({ orderId: result.orderId });
          if (!request) {
            throw new Error("Request not found"); // Handle case where request is not found
          }
          
        }

        const user = await User.findById(request.userId);
        if (!user) {
          throw new Error("User not found"); // Handle case where user is not found
        }
        
        // Ensure booktime is defined
        if (!request.booktime) {
          throw new Error("Book time is missing from the request");
        }

        let chatStartDate: Date;

        if (request.continued === true) {
          // Defensive checks before assigning to Date constructor
          if (!request.usebooktimed || !request.useendTimed) {
            throw new Error("Missing continuation timing details (usebooktimed or useendTimed).");
          }

          request.stattusof = "ongoing";
          chatStartDate = new Date(request.usebooktimed); // Make sure it's defined now
          request.booktime = request.usebooktimed;
          request.endTime = request.useendTimed;
          request.continued = false;
          await request.save();
        } else {
          chatStartDate = new Date(request.booktime); // Safe to assign now
        }
        
        // Helper function to format a Date for Google Calendar (YYYYMMDDTHHmmssZ)
        function formatDateForGoogleCalendar(date: Date): string {
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        }
        
        
        // Parse the chat start time (now safe to assume it's defined)
        const chatStart = new Date(chatStartDate);
        // Adjust the time if it's always coming in 1hr behind your expected time:
        const adjustedChatStart = new Date(chatStart.getTime() + 60 * 60 * 1000);
        
        // Set the event duration to 1 hour (adjust as needed)
        const chatEnd = new Date(adjustedChatStart.getTime() + 60 * 60 * 1000);
        
        // Generate the Google Calendar URL with pre-filled event details.
        const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
          request.nameofservice!
        )}&dates=${formatDateForGoogleCalendar(adjustedChatStart)}/${formatDateForGoogleCalendar(chatEnd)}&details=${encodeURIComponent(
          `Date Booked: ${request.createdAt}`
        )}`;
        
        await sendEmail({
          to: user.email,
          subject: 'Order Confirmed',
          text: `Thanks ${user.fname} ${user.lname} for placing an order on our platform. Here are the details below:
        
        Service Booked: ${request.nameofservice}
        Price: ${result.price}
        Date Booked: ${request.createdAt}
        Time for Chat: ${request.booktime}
        OrderId: ${request.orderId}

        Add to Google Calendar: ${googleCalendarUrl}
        
        Here are some of our other services:
        - Service 1: https://example.com/service1
        - Service 2: https://example.com/service2
        - Service 3: https://example.com/service3
        `,
          html: `<p>Thanks <strong>${user.fname} ${user.lname}</strong> for placing an order on our platform. Here are the details below:</p>
                 <p><strong>Service Booked:</strong> ${request.nameofservice}</p>
                 <p><strong>Price:</strong> ${result.price}</p>
                 <p><strong>Date Booked:</strong> ${request.createdAt}</p>
                 <p><strong>Time for Chat:</strong> ${request.booktime}</p>
                 <p><strong>OrderId:</strong> ${request.orderId}</p>
                 <p>
                   <a href="${googleCalendarUrl}" target="_blank" style="color: #1a73e8; text-decoration: none;">
                     Add to Google Calendar
                   </a>
                 </p>
                 <p>Here are some of our other services:</p>
                 <ul>
                   <li><a href="https://example.com/service1">Service 1</a></li>
                   <li><a href="https://example.com/service2">Service 2</a></li>
                   <li><a href="https://example.com/service3">Service 3</a></li>
                 </ul>`,
        });              
 
      }else if(result?.type == "request"){
        const request = await RequestModel.findOne({ orderId: result.orderId });

          if (!request) {
            throw new Error("Request not found"); // Handle case where request is not found
          }

          const user = await User.findById(request.userId);

          if (!user) {
            throw new Error("User not found"); // Handle case where user is not found
          }

          await sendEmail({
            to: user.email,
            subject: 'Order Confirmed',
            text: `Thanks ${user.fname} ${user.lname} for placing an order on our platform. Here are the details below:

          Service Booked: ${request.nameofservice}
          Price: ${result.price}
          Date Booked: ${request.createdAt}
          OrderId: ${request.orderId}

          Here are some of our other services:
          - Service 1: https://example.com/service1
          - Service 2: https://example.com/service2
          - Service 3: https://example.com/service3
          `,
            html: `<p>Thanks <strong>${user.fname} ${user.lname}</strong> for placing an order on our platform. Here are the details below:</p>
                  <p><strong>Service Booked:</strong> ${request.nameofservice}</p>
                  <p><strong>Price:</strong> ${result.price}</p>
                  <p><strong>Date Booked:</strong> ${request.createdAt}</p>
                  <p><strong>OrderId:</strong> ${request.orderId}</p>
                  <p>Here are some of our other services:</p>
                  <ul>
                    <li><a href="https://example.com/service1">Service 1</a></li>
                    <li><a href="https://example.com/service2">Service 2</a></li>
                    <li><a href="https://example.com/service3">Service 3</a></li>
                  </ul>`,
          });
 
      }

      if(result?.type == "Chat" || result?.type == "request"){
        createAdminNotification(result?.type, result?.orderId ,'New Service Order');
      }
      
     

      if (!result) {
        console.error(`Transaction with reference ${reference} not found.`);
        return res.status(404).json({ message: 'Transaction not found' });
      }

      // Assuming `result.userId` contains the ID of the user who made the transaction
      const userId = result.userId;

      // Check if user is connected, then emit the event
      if (userId && users[userId]) {
        io.to(users[userId]).emit('completed', {
          message: 'Your payment was successful!',
          transaction: result,
        });
        console.log(`Notification sent to user ${userId}`);
      } else {
        console.error(`User ${userId} not connected`);
      }

      console.log(`Transaction updated successfully: ${result}`);
    }

    res.sendStatus(200); // Acknowledge receipt of event
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
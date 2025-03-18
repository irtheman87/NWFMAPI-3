import { Request, Response } from 'express';
import moment from 'moment';
import RequestModel from '../models/Request';
import User from '../models/User';
import sendEmail from '../utils/sendEmail'; // Ensure this function is correctly implemented

export const updateExpiredRequests = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Get current time in GMT+1 and subtract 5 minutes
    const currentTime = moment().utcOffset('+01:00').subtract(5, 'minutes').toISOString();

    // Find all `Chat` requests that are `ongoing` and have an expired `endTime`
    const expiredRequests = await RequestModel.find({
      type: 'Chat',
      stattusof: 'ongoing',
      endTime: { $lte: currentTime }, // Requests where endTime is at least 5 min in the past
    });

    if (expiredRequests.length === 0) {
      return res.status(200).json({ message: 'No expired requests found.' });
    }

    // Loop through each request and process it
    for (const request of expiredRequests) {
      // Update the request status to `completed`
      await RequestModel.updateOne({ _id: request._id }, { $set: { stattusof: 'completed' } });

      // Fetch user details
      const user = await User.findById(request.userId);
      if (!user) {
        console.warn(`User not found for request ID: ${request._id}`);
        continue; // Skip if user not found
      }

      // Send email notification
      await sendEmail({
        to: user.email,
        subject: 'Chat Completed',
        text: `Thanks ${user.fname} ${user.lname} for using our chat service.

Here are some of our other services:
- Service 1: https://example.com/service1
- Service 2: https://example.com/service2
- Service 3: https://example.com/service3
`,
        html: `<p>Thanks <strong>${user.fname} ${user.lname}</strong> for using our chat service.</p>
               <p>Here are some of our other services:</p>
               <ul>
                 <li><a href="https://example.com/service1">Service 1</a></li>
                 <li><a href="https://example.com/service2">Service 2</a></li>
                 <li><a href="https://example.com/service3">Service 3</a></li>
               </ul>`,
      });

      console.log(`Email sent to ${user.email} for request ID: ${request._id}`);
    }

    return res.status(200).json({
      message: 'Expired requests updated and emails sent successfully',
      updatedCount: expiredRequests.length,
    });
  } catch (error) {
    console.error('Error updating requests:', error);
    return res.status(500).json({
      message: 'Failed to update requests',
      error: error,
    });
  }
};

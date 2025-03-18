import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin';
import crypto from 'crypto';
import Extension, {IExtension} from '../models/Extension';
import RequestModel, { IRequest } from '../models/Request';
import Consultant from '../models/consultant';
import AppointmentModel from '../models/Appointment';
import User from '../models/User';
import Transaction from '../models/SetTransaction';
import { createNotification, credit } from '../utils/UtilityFunctions';
import sendEmail from '../utils/sendEmail';
import Task from '../models/task'; // Ensure this path points to your Task model file
import { format, parseISO, add } from 'date-fns';
import moment from 'moment-timezone';
import Issue from '../models/Issuess';
import IssuesThread from '../models/Issuess' 
import Feedback from '../models/Feedback';
import mongoose from 'mongoose';
import MusingModel from '../models/Musing';
import AdminNotificationModel from '../models/AdminNotification';
import WalletHistory from '../models/walletHistoryModel';
import Wallet, { IWallet } from '../models/Wallet';
import Crew from '../models/Crew';
import Company from '../models/Company';
import CrewCompany from '../models/CrewCompany';
import Resolve from '../models/Resolve';
import UserModel from '../models/UserModel';
import EmailList from '../models/EmailList';
import Attendance from '../models/attendanceModel';
import { findSourceMap } from 'module';
import { createCanvas, loadImage, registerFont  } from 'canvas';
const QRCode = require('qrcode');
import fs from 'fs';
import path from 'path';
const axios =  require('axios');
import { S3Client, PutObjectCommand, ObjectCannedACL } from "@aws-sdk/client-s3";
import WeeklySchedule from '../models/Availability';
import ContactFormSubmission from '../models/ContactFormSubmission';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const uploadToS3 = async (buffer: Buffer, filename: string): Promise<string> => {
  const bucketName = process.env.AWS_S3_BUCKET_NAME || '';
  const key = `badges/${filename}`;

  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    ACL: 'private' as ObjectCannedACL, // ✅ Type assertion to fix the error
  };

  try {
    await s3.send(new PutObjectCommand(uploadParams));
    return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`; // S3 URL
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error('Failed to upload image to S3');
  }
};

registerFont('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', { family: 'DejaVuSans' });
// Generate Access Token
export const generateAccessToken = (userId: string, role: string) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
  );
};

// Generate Refresh Token
export const generateRefreshToken = (userId: string) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION }
  );
};

// Register Admin
export const registerAdmin = async (req: Request, res: Response) => {
  const { fname, lname, phone, email, password, expertise} = req.body;

  try {
    // Check for duplicate email
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      fname,
      lname,
      phone,
      email,
      password: hashedPassword,
      role: 'admin',
      expertise
    });

    await newAdmin.save();

    const accessToken = generateAccessToken(String(newAdmin._id), newAdmin.role);
    const refreshToken = generateRefreshToken(String(newAdmin._id));

    const adminInfo = {
      id: newAdmin._id,
      email: newAdmin.email,
      phone: newAdmin.phone,
      fname: newAdmin.fname,
      lname: newAdmin.lname,
      role: newAdmin.role,
      expertise: newAdmin.expertise
    };

    // const verificationLink = `${process.env.BASE_URL}/api/admin/verify/${verificationToken}`;
    // Optionally send verification email
    // await sendEmail(email, 'Verify your email', `Click here to verify your email: ${verificationLink}`);

    res.status(201).json({ accessToken, refreshToken, admin: adminInfo, message: 'Admin Registered Successfully.'});
  } catch (error) {
    if (isMongoError(error) && error.code === 11000) {
      res.status(400).json({ message: 'Admin with this email already exists' });
    } else if (error instanceof Error) {
      res.status(500).json({ message: 'Error registering admin', error: error.message });
    } else {
      res.status(500).json({ message: 'An unknown error occurred' });
    }
  }
};

function isMongoError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

// Login Admin
export const loginAdmin = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  try {
    const admin = await Admin.findOne({ email });
    if (!admin || admin.role !== 'admin') {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const accessToken = generateAccessToken(String(admin._id), admin.role);
    const refreshToken = generateRefreshToken(String(admin._id));

    const adminInfo = {
      id: admin._id,
      fname: admin.fname,
      lname: admin.lname,
      phone: admin.phone,
      email: admin.email,
      role: admin.role,
      expertise: admin.expertise
    };

    // fetchAndUpdateRequests();

    res.json({ accessToken, refreshToken, admin: adminInfo });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
};

// Refresh Admin Token
export const refreshAdminToken = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  const refreshToken = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as { userId: string };
    const accessToken = generateAccessToken(decoded.userId, 'admin');

    res.json({ accessToken });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const createExtension = async (req: Request, res: Response): Promise<Response> => {
  const { length, price } = req.body;

  // Validate the input fields
  if (typeof length !== 'number' || typeof price !== 'number') {
    return res.status(400).json({ message: 'Length and price must be numbers' });
  }

  try {
    const newExtension = new Extension({ length, price });
    const savedExtension = await newExtension.save();
    
    return res.status(201).json({
      message: 'Extension created successfully',
      extension: savedExtension,
    });
  } catch (error) {
    console.error('Error creating new extension:', error);

    // Type check for error to access the message
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    return res.status(500).json({
      message: 'Failed to create new extension',
      error: errorMessage,
    });
  }
};


export const fetchRequestsWithPagination = async (req: Request, res: Response): Promise<Response> => {
  const { page = 1, limit = 10, sort = 'createdAt', order = 'desc', status, type } = req.query;

  try {
    // Validate the Bearer token
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

    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.max(Number(limit), 1);

    let filter: Record<string, any>;

    if (!status) {
      filter = {
        stattusof: { $in: ['pending', 'ongoing', 'completed'] }, // Match status from the list
      };
    } else {
      filter = {
        stattusof: { $in: [status] }, // Match status from the provided value
      };
    }
    
    if (type) {
      filter.type = type; // Add type filter only if provided
    }

    // Fetch paginated and sorted requests
    const requests = await RequestModel.find(filter)
      .sort({ [sort as string]: order === 'desc' ? -1 : 1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    // Fetch associated user and transaction details, filter transactions with status "completed"
    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const transaction = await Transaction.findOne(
          { orderId: request.orderId, status: 'completed' }, // Match by orderId and status
          'orderId status price title' // Fetch specific fields
        );

        if (!transaction) return null; // Exclude requests with no "completed" transactions

        const user = await User.findById(request.userId, 'fname lname email profilepics'); // Fetch specific user details
        const type = request.type;
let cid = null;

if (type === "request") {
  cid = await Task.findOne({ orderId: request.orderId }, "cid");
} else {
  cid = await AppointmentModel.findOne({ orderId: request.orderId }, "cid");
}

console.log("CID fetched:", cid);

if (!cid) {
  console.warn("CID is null or undefined for orderId:", request.orderId);
}

const consultant = cid ? await Consultant.findById(cid.cid, "fname lname") : null;

if (!consultant) {
  console.warn("Consultant not found for CID:", cid);
}


        return {
          ...request.toObject(),
          user,
          assignedConsultant: consultant,
          transaction, // Include transaction details
        };
      })
    );

    // Filter out null values (requests with no completed transactions)
    const filteredRequests = requestsWithDetails.filter((request) => request !== null);

    const totalDocuments = await RequestModel.countDocuments(filter);

    return res.status(200).json({
      message: 'Requests fetched successfully.',
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalDocuments / pageSize),
        totalDocuments: filteredRequests.length,
      },
      requests: filteredRequests,
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    return res.status(500).json({
      message: 'Failed to fetch requests',
      error,
    });
  }
};



export const fetchConsultantsByExpertise = async (req: Request, res: Response): Promise<Response> => {
  const { expertise, date } = req.query;

  try {
    // Validate parameters
    if (!expertise || typeof expertise !== 'string') {
      return res.status(400).json({ message: 'Invalid or missing expertise parameter' });
    }

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ message: 'Invalid or missing date parameter' });
    }

    // Get day of week from date
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });

    // Step 1: Get consultant IDs that are available on the selected day with matching expertise
    const schedules = await WeeklySchedule.find({
      schedule: {
        $elemMatch: {
          day: dayOfWeek,
          status: 'open',
          expertise: expertise,
          slots: { $ne: [] } // must have at least one available slot
        }
      }
    });

    // Extract consultant IDs (cid) from the schedule
    const consultantIds = schedules.map(schedule => schedule.schedule
      .filter(slot => slot.day === dayOfWeek && slot.status === 'open' && slot.expertise.includes(expertise) && slot.slots.length > 0)
      .map(slot => slot.cid.toString())
    ).flat();

    // Remove duplicates
    const uniqueConsultantIds = Array.from(new Set(consultantIds.map(id => id.toString())));

    if (uniqueConsultantIds.length === 0) {
      return res.status(404).json({ message: 'No available consultants found for the selected day and expertise' });
    }

    // Step 2: Fetch consultant details
    const consultants = await Consultant.find({
      _id: { $in: uniqueConsultantIds },
      status: 'active',
      expertise: expertise
    }).select('fname lname _id expertise status');

    if (consultants.length === 0) {
      return res.status(404).json({ message: 'No active consultants found with the specified expertise and availability' });
    }

    return res.status(200).json({
      message: 'Available active consultants fetched successfully',
      consultants,
    });

  } catch (error) {
    console.error('Error fetching consultants:', error);
    return res.status(500).json({ message: 'Failed to fetch consultants', error });
  }
};


export const fetchConsultants = async (req: Request, res: Response): Promise<Response> => {
  try {
    let consultants;
      // Fetch all consultants if expertise is not provided
      consultants = await Consultant.find().select('fname lname _id expertise');

    if (consultants.length === 0) {
      return res.status(404).json({ message: 'No consultants found' });
    }

    return res.status(200).json({
      message: 'Consultants fetched successfully',
      consultants,
    });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return res.status(500).json({ message: 'Failed to fetch consultants', error });
  }
};


export const fetchConsultantEmail = async (cid: string): Promise<string | null> => {
  try {
    // Find the consultant by ID and fetch only the email field
    const consultant = await Consultant.findById(cid, 'email');
    return consultant?.email || null;
  } catch (error) {
    console.error('Error fetching consultant email:', error);
    throw new Error('Failed to fetch consultant email');
  }
};


export const fetchUserEmail = async (uid: string): Promise<string | null> => {
  try {
    // Find the consultant by ID and fetch only the email field
    const user = await User.findById(uid, 'email');
    return user?.email || null;
  } catch (error) {
    console.error('Error fetching consultant email:', error);
    throw new Error('Failed to fetch consultant email');
  }
};

export const createAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Extract and validate the Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;

    try {
      decodedToken = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string); // Ensure JWT_ACCESS_SECRET is set
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check for admin role in the token payload
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Extract appointment details from the request body
    const { date, time, uid, cid, orderId, expertise } = req.body;

    // Validate the request body
    if (!date || !time || !uid || !cid || !orderId || !expertise) {
      return res.status(400).json({ message: 'Missing required appointment details' });
    }

    // Check if an appointment with the same `cid` and `date` already exists
 // Check if the count of appointments with the consultant on the given date is already 3
 const existingAppointmentsCount = await AppointmentModel.countDocuments({
  cid,
  date,
});

if (existingAppointmentsCount >= 3) {
  return res.status(409).json({
    message: 'The maximum number of appointments with this consultant on this date has been reached.',
  });
}

    // Create the new appointment
    const newAppointment = new AppointmentModel({
      date,
      time,
      uid,
      cid,
      orderId,
      expertise,
    });

    // Save the appointment to the database
    const savedAppointment = await newAppointment.save();

       const request = await RequestModel.findOne({ orderId: orderId });
        if (!request) {
          throw new Error("Request not found"); // Handle case where request is not found
        }
        
        const consultant = await Consultant.findById(cid);
        if (!consultant) {
          throw new Error("User not found"); // Handle case where user is not found
        }
        
        // Ensure booktime is defined
        if (!request.booktime) {
          throw new Error("Book time is missing from the request");
        }
        
        // Helper function to format a Date for Google Calendar (YYYYMMDDTHHmmssZ)
        function formatDateForGoogleCalendar(date: Date): string {
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        }
        
        // Parse the chat start time (now safe to assume it's defined)
        const chatStart = new Date(request.booktime);
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

    // Consultant Notification Created
    createNotification(cid.toString(), uid.toString(), 'consultant', 'Chat', orderId.toString(), 'New Order', 'You have a New Order Match');
    // User Notification Created
    createNotification(uid.toString(), cid.toString(), 'user', 'Chat', orderId.toString(), 'Chat Assigned', 'Your Chat Request Has Been Assigned to a Consultant');

    const email = await fetchConsultantEmail(cid);
    if (email) {
      (async () => {
        try {
          await sendEmail({
            to: email,
            subject: 'New Order',
            text: `Hello ${consultant.fname} ${consultant.lname},
          
          You have a new order. Details below:
          
          Service Booked: ${request.nameofservice}
          Date Booked: ${request.createdAt}
          Time for Chat: ${request.booktime}
          Add to Google Calendar: ${googleCalendarUrl}
          
          View Order: https://nollywoodfilmmaker.com/consultants/dashboard
          `,
            html: `
              <h1>Hello ${consultant.fname} ${consultant.lname},</h1>
              <p>You have a new order. Details below:</p>
              <ul>
                <li><strong>Service Booked:</strong> ${request.nameofservice}</li>
                <li><strong>Date Booked:</strong> ${request.createdAt}</li>
                <li><strong>Time for Chat:</strong> ${request.booktime}</li>
                <li><strong>Add to Google Calendar:</strong> <a href="${googleCalendarUrl}" target="_blank">Click here</a></li>
              </ul>
              <p>
                <a href="https://nollywoodfilmmaker.com/consultants/dashboard" 
                   style="display:inline-block; padding:10px 20px; color:#fff; background:#28a745; text-decoration:none; border-radius:5px;">
                  View Order
                </a>
              </p>
            `,
          });              
          console.log('Email sent successfully.');
        } catch (error) {
          console.error('Failed to send email:', error);
        }
      })();
    } else {
      console.log('Consultant not found');
    }

    // Update the corresponding request with the same orderId and set its status to "ongoing"
    const updatedRequest = await RequestModel.findOneAndUpdate(
      { orderId }, // Match the orderId
      { stattusof: 'ongoing' }, // Update the stattusof field to "ongoing"
      { new: true } // Return the updated document
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: 'Request not found with the provided orderId.' });
    }

    return res.status(201).json({
      message: 'Appointment created successfully, and request status updated.',
      appointment: savedAppointment,
      updatedRequest,
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return res.status(500).json({
      message: 'Failed to create appointment',
      error,
    });
  }
};


export const fetchAllUsers = async (req: Request, res: Response): Promise<Response> => {
  const { page = 1, limit = 10, email } = req.query;

  try {
    // Extract and validate the Bearer token
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

    // Validate pagination parameters
    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.max(Number(limit), 1);

    // Build the filter query
    const filter: Record<string, any> = {};
    if (email) {
      filter.email = { $regex: email, $options: 'i' }; // Case-insensitive search by email
    }

    // Fetch the total count of documents
    const totalDocuments = await User.countDocuments(filter);

    // Fetch paginated user details, excluding password
    const users = await User.find(filter)
      .select('-password') // Exclude the password field
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.status(200).json({
      message: 'Users fetched successfully.',
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalDocuments / pageSize),
        totalDocuments,
      },
      users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      message: 'Failed to fetch users',
      error,
    });
  }
};


export const createTask = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check if the Bearer token is provided
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

    const { date, uid, cid, orderId, expertise, nameofservice, status, type } = req.body;

    // Validate required fields
    if (!date || !uid || !cid || !orderId || !expertise || !nameofservice || !status) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Check if the orderId is unique in the Task model
    const existingTask = await Task.findOne({ orderId });
    if (existingTask) {
      return res.status(400).json({ message: 'A task with this orderId already exists' });
    }

    // Create a new task
    const task = new Task({
      date,
      uid,
      cid,
      orderId,
      expertise,
      nameofservice,
      status,
      type: type || 'request', // Default to 'request' if type is not provided
    });

    // Save the task to the database
    const savedTask = await task.save();
    // Consultant Notification Created
    createNotification(cid.toString(), uid.toString(), 'consultant', 'Request', orderId.toString(), 'New Order', 'You have a New Order Match');
    // User Notification Created
    createNotification(uid.toString(),cid.toString(), 'user', 'Request', orderId.toString(), 'Request Assigned', 'Your Request Has Been Assigned to a Consultant');
    const email = await fetchConsultantEmail(cid);
    if (email) {
      (async () => {
        try {
          await sendEmail({
            to: email,
            subject: 'New Order',
            text: `You Have A New Order. Please check your dashboard for details.`,
            html: `
              <h1>New Order Received</h1>
              <p>You have a new order. Please check your dashboard for details.</p>
              <p><a href="https://nollywoodfilmmaker.com/dashboard" style="display:inline-block; padding:10px 20px; color:#fff; background:#28a745; text-decoration:none; border-radius:5px;">View Order</a></p>
            `,
          });          
          console.log('Email sent successfully.');
        } catch (error) {
          console.error('Failed to send email:', error);
        }
      })();
  
    } else {
      console.log('Consultant not found');
    }

    // Update the `stattusof` field to "ongoing" for the matching `orderId` in the RequestModel
    const updatedRequest = await RequestModel.findOneAndUpdate(
      { orderId },
      { $set: { stattusof: 'ongoing' } },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: 'No request found with the provided orderId to update' });
    }

    return res.status(201).json({
      message: 'Task created successfully and request status updated to ongoing',
      task: savedTask,
      updatedRequest,
    });
  } catch (error) {
    console.error('Error creating task:', error);
    return res.status(500).json({ message: 'Failed to create task', error });
  }
};


// export async function fetchAndUpdateRequests() {
//   try {
//     const requests = await RequestModel.find({});

//     // Update endTime for each request
//     const updates = requests.map(async (request) => {
//       if (request.booktime) {
//         // const booktimeDate = new Date(request.booktime);
//         // const updatedEndTime = new Date(booktimeDate.getTime() + 60 * 60 * 1000); // Add 1 hour

//       const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
     
//       // Calculate `endTime` by adding 1 hour to `booktime`
//       const endDateTime = add(new Date(request.booktime), { hours: 1 });
//       const endTime = moment(endDateTime).utcOffset('+01:00').format(gmtPlusOneFormat);

//         request.endTime = endTime;
//         await request.save();
//       }
//     });

//     await Promise.all(updates);

//     console.log('All requests fetched and updated successfully.');
//     return requests;
//   } catch (error) {
//     console.error('Error fetching and updating requests:', error);
//     throw error;
//   }
// }

export const fetchTransactionStats = async (req: Request, res: Response): Promise<Response> => {
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

    // Fetch transactions without `originalOrderId` whose status is completed
    const completedTransactions = await Transaction.find({
      originalOrderId: { $exists: false },
      status: 'completed',
    });

    // Total count of completed transactions
    const completedCount = completedTransactions.length;

    // Calculate total price of completed transactions
    const totalCompletedPrice = completedTransactions.reduce((sum, transaction) => {
      return sum + parseFloat(transaction.price);
    }, 0);

    // Fetch all transactions without `originalOrderId`
    const allTransactionsWithoutOriginal = await Transaction.find({
      originalOrderId: { $exists: false },
    });

    // Total count of all transactions without `originalOrderId`
    const totalTransactionsCount = allTransactionsWithoutOriginal.length;

    // Difference as Failed/Pending transactions
    const failedOrPendingCount = totalTransactionsCount - completedCount;

    // Return the stats in the response
    return res.status(200).json({
      completedCount,
      totalTransactionsCount,
      failedOrPendingCount,
      totalCompletedPrice: (totalCompletedPrice/100),
    });
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    return res.status(500).json({ message: 'Failed to fetch transaction stats', error });
  }
};

export const fetchUserAndConsultantStats = async (req: Request, res: Response): Promise<Response> => {
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
    // Fetch total number of users
    const totalUsers = await User.countDocuments();

    // Fetch total number of consultants
    const totalConsultants = await Consultant.countDocuments();

    return res.status(200).json({
      totalUsers,
      totalConsultants,
    });
  } catch (error) {
    console.error('Error fetching user and consultant stats:', error);
    return res.status(500).json({
      message: 'Failed to fetch user and consultant stats',
      error,
    });
  }
};

export const fetchTopNewestUsers = async (req: Request, res: Response): Promise<Response> => {
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
    // Fetch the top 5 newest user accounts sorted by creation date in descending order
    const newestUsers = await User.find({})
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(5) // Limit the result to the top 5
      .select('fname lname email profilepics createdAt') // Only fetch selected fields

    // Send the result
    return res.status(200).json({
      message: 'Top 5 newest user accounts retrieved successfully',
      data: newestUsers,
    });
  } catch (error) {
    console.error('Error fetching top 5 newest users:', error);
    return res.status(500).json({
      message: 'Failed to fetch top 5 newest users',
      error,
    });
  }
};

export const fetchMonthlyTransactionTotals = async () => {
  try {
    
    // Get the current year
    const currentYear = new Date().getFullYear();

    // Group transactions by month and calculate totals
    const monthlyTotals = await Transaction.aggregate([
      {
        $match: {
          status: 'completed', // Only completed transactions
          createdAt: {
            $gte: new Date(`${currentYear}-01-01T00:00:00Z`), // Start of the year
            $lte: new Date(`${currentYear}-12-31T23:59:59Z`), // End of the year
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" }, // Group by month
          totalTransactions: { $sum: 1 }, // Count transactions
          totalPrice: { $sum: { $toDouble: "$price" } }, // Sum up the price field
        },
      },
      {
        $sort: { _id: 1 }, // Sort by month (ascending)
      },
    ]);

    // Map month numbers to month names
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    // Convert results to include month names
    const formattedResults = monthlyTotals.map(({ _id, totalTransactions, totalPrice }) => ({
      month: monthNames[_id - 1], // Map the month number to its name (1-based index)
      totalTransactions,
      totalPrice,
    }));

    return formattedResults;
  } catch (error) {
    console.error('Error fetching monthly transaction totals:', error);
    throw new Error('Failed to fetch monthly transaction totals');
  }
};

export const fetchAllConsultants = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Verify Authorization Header
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Extract pagination query parameters
    const page = parseInt(req.query.page as string, 10) || 1; // Default to page 1
    const limit = parseInt(req.query.limit as string, 10) || 10; // Default to 10 per page
    const skip = (page - 1) * limit;

    // Fetch consultants with pagination
    const consultants = await Consultant.find(
      { role: 'consultant', status: 'active' },
      'fname lname email phone expertise profilepics location createdAt' // Select specific fields
    )
      .skip(skip)
      .limit(limit);

    const totalConsultants = await Consultant.countDocuments({ role: 'consultant' });

    return res.status(200).json({
      consultants,
      pagination: {
        totalItems: totalConsultants,
        totalPages: Math.ceil(totalConsultants / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return res.status(500).json({ message: 'Failed to fetch consultants', error });
  }
};

export const getAllConsultantsList = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Verify Authorization Header
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Extract search query
    const search = req.query.search as string;

    // Define query
    const query: any = { role: 'consultant', status: 'active' };

    if (search) {
      query.$or = [
        { fname: { $regex: search, $options: 'i' } }, // Case-insensitive search on fname
        { lname: { $regex: search, $options: 'i' } }, // Case-insensitive search on lname
      ];
    }

    // Fetch consultants based on search criteria
    const consultants = await Consultant.find(query, 'fname lname email phone expertise profilepics location createdAt');

    return res.status(200).json({ consultants });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return res.status(500).json({ message: 'Failed to fetch consultants', error });
  }
};

export const createConsultant = async (req: Request, res: Response): Promise<Response> => {
  const { fname, lname, email, phone, state, country, expertise } = req.body;

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Validate input
    if (!fname || !lname || !email || !phone || !state || !country) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if consultant already exists
    const existingConsultant = await Consultant.findOne({ email });
    if (existingConsultant) {
      return res.status(409).json({ message: 'Consultant with this email already exists' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create the consultant
    const newConsultant = new Consultant({
      fname,
      lname,
      email,
      phone,
      expertise,
      status: 'inactive',
      location: { state, country },
      verificationToken,
    });

    await newConsultant.save();

    // Generate verification link
    const verificationLink = `https://nollywoodfilmmaker.com/consultants/auth/set-password?token=${verificationToken}`;

    // Send verification email with HTML content
    try {
      await sendEmail({
        to: email,
        subject: 'Account Created (Verify Your Email)',
        text: `Welcome to Nollywood Filmmaker, ${fname}!
        
        Your consultant account has been created successfully.
      
        Please verify your email and set your password by clicking the link below:
        
        ${verificationLink}
        
        If you cannot click the link, copy and paste it into your browser.
        
        Thank you for joining us!`,
        html: `
          <h1>Welcome to Nollywood Filmmaker, ${fname}!</h1>
          <p>Your consultant account has been created successfully.</p>
          <p>Please verify your email and set your password by clicking the link below:</p>
          <a href="${verificationLink}" style="display:inline-block; padding:10px 20px; color:#fff; background:#007BFF; text-decoration:none; border-radius:5px;">Verify Email</a>
          <p>If the button above does not work, you can use the following link:</p>
          <p><a href="${verificationLink}">${verificationLink}</a></p>
          <p>Thank you for joining us!</p>
        `,
      });
      

      console.log('Verification email sent successfully.');
    } catch (error) {
      console.error('Failed to send verification email:', error);
    }

    return res.status(201).json({ message: 'Consultant created and verification email sent' });
  } catch (error) {
    console.error('Error creating consultant:', error);
    return res.status(500).json({ message: 'Failed to create consultant', error });
  }
};


export const fetchIssuesWithUserDetails = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Retrieve query parameters for pagination
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (pageNumber <= 0 || limitNumber <= 0) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }

    // Fetch issues with user details
    const issues = await Issue.find()
      .populate({
        path: 'uid',
        select: 'fname lname email profilepics',
        model: User,
      })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .sort({ createdAt: -1 }); // Sort by most recent issues first

    // Total number of issues for pagination
    const totalIssues = await Issue.countDocuments();

    // Prepare and send the response
    return res.status(200).json({
      message: 'Issues fetched successfully',
      totalItems: totalIssues,
      totalPages: Math.ceil(totalIssues / limitNumber),
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      issues: issues.map((issue) => ({
        id: issue._id,
        orderId: issue.orderId,
        title: issue.title,
        complain: issue.complain,
        status: issue.status,
        consultantId: issue.cid,
        createdAt: issue.createdAt,
        user: issue.uid, // Includes fname, lname, email, profilepics from population
      })),
    });
  } catch (error) {
    console.error('Error fetching issues:', error);
    return res.status(500).json({ message: 'Failed to fetch issues', error });
  }
};

export const closeIssue = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Issue ID from route parameters

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Check if issue exists
    const issue = await Issue.findById(id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    // Check if issue is already closed
    if (issue.status === 'closed') {
      return res.status(400).json({ message: 'Issue is already closed' });
    }

    // Update the status to "closed"
    issue.status = 'closed';
    await issue.save();

    return res.status(200).json({
      message: 'Issue status updated to closed successfully',
      issue,
    });
  } catch (error) {
    console.error('Error updating issue status:', error);
    return res.status(500).json({
      message: 'Failed to update issue status',
      error,
    });
  }
};

export const fetchConsultantById = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Consultant ID from route parameters

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch consultant by ID, excluding password
    const consultant = await Consultant.findById(id).select('-password');

    if (!consultant) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    // Add dummy data
    const totalWithdrawals = await WalletHistory.aggregate([
      { $match: { cid: id, type: 'withdrawal', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get wallet balance
    const wallet = await Wallet.findOne({ cid: id });

    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const subtotal = totalWithdrawals && totalWithdrawals.length > 0 ? totalWithdrawals[0].total : 0;

    const stats = {
      alltimerev: (subtotal + wallet.balance)/100, // Random number between 1000 and 10999
      alltimependingrev: wallet.balance/100, // Random number between 500 and 5499
      alltimeclaimedrev: subtotal/100, // Random number between 200 and 3199
    };

    return res.status(200).json({
      message: 'Consultant retrieved successfully',
      consultant,
      ...stats,
    });
  } catch (error) {
    console.error('Error fetching consultant:', error);
    return res.status(500).json({ message: 'Failed to fetch consultant', error });
  }
};

export const fetchUserDetails = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // User ID from route parameters

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    const user = await User.findById(id).select('-password -verificationToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate the total number of successful transactions
    const successfulTransactions = await Transaction.find({
      userId: id,
      status: 'completed',
    });
    const totalTransactions = successfulTransactions.length;

    // Calculate the total price of successful transactions
    const totalPrice = successfulTransactions.reduce(
      (sum, transaction) => sum + parseFloat(transaction.price),
      0
    );

    // Fetch feedback and calculate the average ratings
    const feedbacks = await Feedback.find({ userId: id });
    const totalFeedbacks = feedbacks.length;

    const averageRatings = feedbacks.reduce(
      (averages, feedback) => {
        averages.quality += feedback.quality;
        averages.speed += feedback.speed;
        return averages;
      },
      { quality: 0, speed: 0 }
    );

    const averageQuality =
      totalFeedbacks > 0 ? averageRatings.quality / totalFeedbacks : 0;
    const averageSpeed =
      totalFeedbacks > 0 ? averageRatings.speed / totalFeedbacks : 0;

    // Fetch total number of chats with specified conditions
    const totalChats = await RequestModel.countDocuments({
      userId: id,
      type: 'Chat',
      stattusof: { $in: ['ongoing', 'completed'] },
    });

    return res.status(200).json({
      message: 'User details fetched successfully',
      user,
      metrics: {
        totalTransactions,
        totalPrice: (totalPrice/100),
        averageRatings: {
          quality: averageQuality,
          speed: averageSpeed,
        },
        totalChats,
      },
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    return res.status(500).json({ message: 'Failed to fetch user details', error });
  }
};

export const fetchCompletedUserRequests = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;

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

    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    if (pageNumber <= 0 || limitNumber <= 0) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }

    const requests = await RequestModel.find(
      {
        userId,
        stattusof: 'completed',
      },
      'movie_title chat_title stattusof time orderId nameofservice type date createdAt updatedAt'
    )
      .sort({ updatedAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    // Enrich requests with transaction and consultant data
    const detailedRequests = await Promise.all(
      requests.map(async (requestDoc) => {
        const request = requestDoc.toObject();

        const transaction = await Transaction.findOne(
          { orderId: request.orderId, status: 'completed' },
          'orderId status price title'
        );

        const user = await User.findById(request.userId, 'fname lname email profilepics');

        let consultant = null;
        let cid = null;

        if (request.type === 'request') {
          cid = await Task.findOne({ orderId: request.orderId }, 'cid');
        } else {
          cid = await AppointmentModel.findOne({ orderId: request.orderId }, 'cid');
        }

        if (cid && cid.cid) {
          consultant = await Consultant.findById(cid.cid, 'fname lname');
        }

        return {
          ...request,
          user,
          transaction,
          assignedConsultant: consultant,
        };
      })
    );

    const totalRequests = await RequestModel.countDocuments({
      userId,
      stattusof: 'completed',
    });

    const totalPages = Math.ceil(totalRequests / limitNumber);

    return res.status(200).json({
      message: 'Completed requests fetched successfully',
      totalItems: totalRequests,
      totalPages,
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      requests: detailedRequests,
    });
  } catch (error) {
    console.error('Error fetching completed requests:', error);
    return res.status(500).json({
      message: 'Failed to fetch completed requests',
      error,
    });
  }
};

export const getActiveRequestForConsultant = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Consultant ID
  const { page = 1, limit = 10, sort = 'desc' } = req.query;

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Parse page and limit to integers
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;

    // Fetch all appointments and tasks for the given consultant ID
    const appointments = await AppointmentModel.find({ cid: id }, 'orderId');
    const tasks = await Task.find({ cid: id }, 'orderId');

    // Combine orderIds from appointments and tasks
    const combinedOrderIds = [
      ...appointments.map((appointment) => appointment.orderId),
      ...tasks.map((task) => task.orderId),
    ];

    // Fetch requests and user details for the combined orderIds
    const requestsWithDetails = await Promise.all(
      combinedOrderIds.map(async (orderId) => {
        const request = await RequestModel.findOne({
          orderId,
          stattusof: { $nin: ['pending', 'completed'] }, // Exclude 'pending' and 'completed'
        });

        if (request) {
          // Fetch user details by userId, excluding sensitive fields
          const user = await User.findById(request.userId).select('-password -isVerified -verificationToken -createdAt -updatedAt -expertise');

          if (user) {
            return {
              orderId,
              request: request.toObject(),
              user: user.toObject(), // Include user details
            };
          }
        }

        return null; // Exclude invalid or unmatched records
      })
    );

    // Filter out null values
    const validRequests = requestsWithDetails.filter((entry) => entry !== null);

    if (!validRequests.length) {
      return res.status(200).json({ message: 'No active requests found for this consultant' });
    }

    // Apply pagination to valid requests
    const startIndex = (pageNumber - 1) * limitNumber;
    const paginatedRequests = validRequests.slice(startIndex, startIndex + limitNumber);

    // Return the list of requests with valid details
    return res.status(200).json({
      message: 'Active requests fetched successfully',
      page: pageNumber,
      limit: limitNumber,
      total: validRequests.length,
      requests: paginatedRequests,
    });
  } catch (error) {
    console.error('Error fetching active requests:', error);
    return res.status(500).json({ message: 'Failed to fetch active requests', error });
  }
};


export const fetchConsultantHistoryByCid = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params;
  const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Validate cid
    if (!cid || typeof cid !== 'string') {
      return res.status(400).json({ message: 'Invalid consultant ID (cid)' });
    }

    // Ensure page and limit are numbers
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({ message: 'Invalid page or limit parameter' });
    }

    // Fetch appointments and tasks with the given cid
    const appointments = await AppointmentModel.find({ cid }, 'orderId');
    const tasks = await Task.find({ cid }, 'orderId');

    // Combine orderIds and orderIdsss
    const combinedOrderIds = [...appointments.map((appointment) => appointment.orderId), ...tasks.map((task) => task.orderId)];

    // Fetch paginated completed requests
    const completedRequests = await RequestModel.find(
      {
        orderId: { $in: combinedOrderIds }, // Match the combined orderIds
        stattusof: 'completed', // Status must be completed
      },
      'movie_title chat_title stattusof time userId orderId nameofservice date createdAt updatedAt' // Select specific fields
    )
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .sort({ updatedAt: -1 }); // Sort by most recent updatedAt

    // Count total documents for pagination info
    const totalCount = await RequestModel.countDocuments({
      orderId: { $in: combinedOrderIds },
      stattusof: 'completed',
    });

    // Process musings and fetch user info
    const musings = [];
    for (const request of completedRequests) {
      const { userId } = request;

      // Fetch user details
      const user = await User.findById(userId, 'fname lname email profilepics role expertise');

      // Check if a musing already exists for the userId
      let musing = await MusingModel.findOne({ userId });

      // If no musing exists, create a new one with a summary placeholder
      if (!musing) {
        musing = await MusingModel.create({
          userId,
          summary: `Default summary for user: ${user?.fname} ${user?.lname}`,
        });
      }

      musings.push({
        request,
        userInfo: user,
        musing,
      });
    }

    return res.status(200).json({
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limitNumber),
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      completedRequests: musings,
    });
  } catch (error) {
    console.error('Error fetching assignments and requests:', error);
    return res.status(500).json({
      message: 'Failed to fetch assignments and requests',
      error: error,
    });
  }
};

export const fetchAdminNotifications = async (req: Request, res: Response): Promise<Response> => {
  const { page = 1, limit = 10, status, type, sort = 'asc' } = req.query;

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Parse pagination and sorting inputs
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;

    // Validate page and limit
    if (pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({ message: 'Invalid page or limit values' });
    }

    // Build the filter object based on query parameters
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    // Fetch filtered and paginated notifications
    const notifications = await AdminNotificationModel.find(filter)
      .sort({ createdAt: sort === 'desc' ? 1 : -1 }) // Sort by creation date
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    // Count total matching documents for pagination
    const totalCount = await AdminNotificationModel.countDocuments(filter);

    // Count total unread notifications
    const unreadCount = await AdminNotificationModel.countDocuments({ status: 'unread' });

    return res.status(200).json({
      message: 'Admin notifications fetched successfully',
      data: notifications,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      },
      unreadCount, // Include count of unread notifications
    });
  } catch (error) {
    console.error('Error fetching admin notifications:', error);
    return res.status(500).json({
      message: 'Failed to fetch admin notifications',
      error,
    });
  }
};

export const markNotificationAsRead = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // ID of the notification to update

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Find the notification by ID and update its status to 'read'
    const notification = await AdminNotificationModel.findByIdAndUpdate(
      id,
      { status: 'read' }, // Update the status field
      { new: true } // Return the updated document
    );

    // Check if the notification exists
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Respond with the updated notification
    return res.status(200).json({
      message: 'Notification marked as read',
      notification,
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    return res.status(500).json({ message: 'Failed to update notification status', error });
  }
};

export const suspendConsultant = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Find and update the consultant's status to "suspended"
    const updatedConsultant = await Consultant.findByIdAndUpdate(
      id,
      { status: 'suspended' },
      { new: true } // Return the updated document
    );

    // If consultant not found
    if (!updatedConsultant) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    return res.status(200).json({
      message: 'Consultant status updated to suspended',
      consultant: updatedConsultant,
    });
  } catch (error) {
    console.error('Error suspending consultant:', error);
    return res.status(500).json({ message: 'Failed to suspend consultant', error });
  }
};

export const deleteConsultant = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Find and delete the consultant by ID
    const deletedConsultant = await Consultant.findByIdAndDelete(id);

    // If consultant not found
    if (!deletedConsultant) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    return res.status(200).json({
      message: 'Consultant successfully deleted',
      consultant: deletedConsultant,
    });
  } catch (error) {
    console.error('Error deleting consultant:', error);
    return res.status(500).json({ message: 'Failed to delete consultant', error });
  }
};
export const updateConsultant = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Consultant ID
  const { fname, lname, email, phone, state, country, expertise } = req.body;

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Build the update object dynamically to avoid overwriting fields accidentally
    const updates: any = {};
    if (fname) updates.fname = fname;
    if (lname) updates.lname = lname;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    if (state || country) {
      updates.location = {}; // Initialize location if any location field exists
      if (state) updates.location.state = state;
      if (country) updates.location.country = country;
    }
    if (expertise) updates.expertise = expertise;

    // Find and update the consultant
    const updatedConsultant = await Consultant.findByIdAndUpdate(id, updates, { new: true });

    // If consultant not found
    if (!updatedConsultant) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    return res.status(200).json({
      message: 'Consultant successfully updated',
      consultant: updatedConsultant,
    });
  } catch (error) {
    console.error('Error updating consultant:', error);
    return res.status(500).json({ message: 'Failed to update consultant', error });
  }
};

export const getAverageRatings = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const feedbackStats = await Feedback.aggregate([
      // First stage: Group by a null ID to calculate average ratings and count occurrences
      {
        $group: {
          _id: null, // Group all documents together
          avgQuality: { $avg: '$quality' }, // Average of quality
          avgSpeed: { $avg: '$speed' },     // Average of speed
          totalFeedbacks: { $sum: 1 }, // Count total feedbacks
          qualityOne: { $sum: { $cond: [{ $eq: ['$quality', 1] }, 1, 0] } }, // Count 1 star quality feedbacks
          qualityTwo: { $sum: { $cond: [{ $eq: ['$quality', 2] }, 1, 0] } }, // Count 2 star quality feedbacks
          qualityThree: { $sum: { $cond: [{ $eq: ['$quality', 3] }, 1, 0] } }, // Count 3 star quality feedbacks
          qualityFour: { $sum: { $cond: [{ $eq: ['$quality', 4] }, 1, 0] } }, // Count 4 star quality feedbacks
          qualityFive: { $sum: { $cond: [{ $eq: ['$quality', 5] }, 1, 0] } }, // Count 5 star quality feedbacks
          speedOne: { $sum: { $cond: [{ $eq: ['$speed', 1] }, 1, 0] } },     // Count 1 star speed feedbacks
          speedTwo: { $sum: { $cond: [{ $eq: ['$speed', 2] }, 1, 0] } },     // Count 2 star speed feedbacks
          speedThree: { $sum: { $cond: [{ $eq: ['$speed', 3] }, 1, 0] } },   // Count 3 star speed feedbacks
          speedFour: { $sum: { $cond: [{ $eq: ['$speed', 4] }, 1, 0] } },    // Count 4 star speed feedbacks
          speedFive: { $sum: { $cond: [{ $eq: ['$speed', 5] }, 1, 0] } },    // Count 5 star speed feedbacks
        }
      }
    ]);

    if (feedbackStats.length === 0) {
      return res.status(200).json({
        message: 'No feedback data available',
        avgQuality: 0,
        avgSpeed: 0,
        totalFeedbacks: 0,
        qualityRatings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        speedRatings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    }

    return res.status(200).json({
      message: 'Average ratings and feedback data retrieved successfully',
      avgQuality: feedbackStats[0].avgQuality,
      avgSpeed: feedbackStats[0].avgSpeed,
      totalFeedbacks: feedbackStats[0].totalFeedbacks,
      qualityRatings: {
        1: feedbackStats[0].qualityOne,
        2: feedbackStats[0].qualityTwo,
        3: feedbackStats[0].qualityThree,
        4: feedbackStats[0].qualityFour,
        5: feedbackStats[0].qualityFive,
      },
      speedRatings: {
        1: feedbackStats[0].speedOne,
        2: feedbackStats[0].speedTwo,
        3: feedbackStats[0].speedThree,
        4: feedbackStats[0].speedFour,
        5: feedbackStats[0].speedFive,
      },
    });
  } catch (error) {
    console.error('Error fetching average ratings and statistics:', error);
    return res.status(500).json({
      message: 'Failed to calculate average ratings or fetch statistics',
      error,
    });
  }
};


export const getTopConsultantsByRating = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Aggregate feedback to find the top 5 consultants
    const feedbackData = await Feedback.aggregate([
      {
        $lookup: {
          from: 'appointments',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'appointments',
        },
      },
      {
        $group: {
          _id: { $arrayElemAt: ['$appointments.cid', 0] }, // Consultant ID
          avgQuality: { $avg: '$quality' },
          avgSpeed: { $avg: '$speed' },
          avgSum: { $avg: { $add: ['$quality', '$speed'] } },
        },
      },
      { $sort: { avgSum: -1 } },
      { $limit: 5 },
    ]);

    if (feedbackData.length === 0) {
      return res.status(200).json({
        message: 'No feedback data available',
        consultants: [],
      });
    }

    const consultantsData = await Promise.all(
      feedbackData.map(async (feedback) => {
        const consultant = await Consultant.findById(feedback._id).select(
          'fname lname email phone profilepics expertise bio'
        );

        if (!consultant) return null;

        const appointmentCount = await AppointmentModel.countDocuments({ cid: feedback._id });

        return {
          ...consultant.toObject(),
          avgQuality: feedback.avgQuality,
          avgSpeed: feedback.avgSpeed,
          avgSum: feedback.avgSum,
          appointmentCount,
          totalRequest: appointmentCount,
        };
      })
    );

    // Filter out any null consultants (in case a consultant was deleted but feedback remains)
    const topConsultants = consultantsData.filter((consultant) => consultant !== null);

    return res.status(200).json({
      message: 'Top consultants fetched successfully',
      consultants: topConsultants,
    });
  } catch (error) {
    console.error('Error fetching top consultants:', error);
    return res.status(500).json({
      message: 'Failed to fetch top consultants',
      error,
    });
  }
};

export async function getReadyRequests(req: Request, res: Response): Promise<Response> {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch all requests where 'stattusof' is 'ready'
    const requests: IRequest[] = await RequestModel.find({ stattusof: 'ready' }).exec();
    
    if (requests.length === 0) {
      return res.status(404).json({ message: 'No ready requests found' });
    }

    return res.status(200).json(requests);
  } catch (error) {
    console.error('Error fetching ready requests:', error);
    return res.status(500).json({ message: 'Failed to fetch ready requests' });
  }
}

export async function getRequestByOrderId(req: Request, res: Response): Promise<Response> {
  const { orderId } = req.params; // Extract the orderId from URL parameters

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch the request using orderId
    const request: IRequest | null = await RequestModel.findOne({ orderId }).exec();

    if (!request) {
      return res.status(404).json({ message: `Request with orderId ${orderId} not found` });
    }

    return res.status(200).json(request);
  } catch (error) {
    console.error('Error fetching request by orderId:', error);
    return res.status(500).json({ message: 'Failed to fetch request' });
  }
}

export async function setRequestStatusToCompleted(req: Request, res: Response): Promise<Response> {
  const { orderId } = req.params; // Extracting orderId from URL parameters

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Find the task by orderId
    const task = await Task.findOne({ orderId }).exec();
    
    if (!task) {
      return res.status(404).json({ message: `Task with orderId ${orderId} not found` });
    }

    // Fetch the request using orderId
    const request: IRequest | null = await RequestModel.findOne({ orderId }).exec();

    if (!request) {
      return res.status(404).json({ message: `Request with orderId ${orderId} not found` });
    }

    // Set the 'stattusof' field to 'completed'
    request.stattusof = 'completed';
    await request.save(); // Save the updated request to the database

    task.status = 'completed';
    await task.save();

    // Fetch the price from the Transaction model using orderId
    const transaction = await Transaction.findOne({ orderId }).exec();
    
    if (!transaction) {
      return res.status(404).json({ message: `Transaction with orderId ${orderId} not found` });
    }

    const price = transaction.price;
    let actualIncome = 0;

    // Fetch the `cid` from the Task model
    const cid = task.cid;
    if(transaction.title == "Read my Script and advice" || transaction.title == "Watch the Final cut of my film and advice" || transaction.title == "Look at my Budget and advice" ){
      const working_cost = parseFloat(price)  - 5000000;
      const newCost = working_cost - 1000000;
      actualIncome = newCost * 0.5;
    }else{
      const newCost = parseFloat(price) - 1000000;
      actualIncome = newCost * 0.5;
    }

    // Here you would perform the credit or debit operation (credit/cid, price or amount depending on your logic)
    credit(cid, actualIncome, orderId); // Example: assuming 'credit' needs `cid` and `price`

//     const myrequest = await RequestModel.findOne({ orderId: result.orderId });

// if (!request) {
//   throw new Error("Request not found");
// }

const user = await User.findById(request.userId);

if (!user) {
  throw new Error("User not found");
}

await sendEmail({
  to: user.email,
  subject: "Request Completed",
  text: `Thanks ${user.fname} ${user.lname} for using our request service.

Here are some of our other services:
- Service 1: https://example.com/service1
- Service 2: https://example.com/service2
- Service 3: https://example.com/service3
`,
  html: `<p>Thanks <strong>${user.fname} ${user.lname} </strong> for using our request service.</p>
         <p>Here are some of our other services:</p>
         <ul>
           <li><a href="https://example.com/service1">Service 1</a></li>
           <li><a href="https://example.com/service2">Service 2</a></li>
           <li><a href="https://example.com/service3">Service 3</a></li>
         </ul>`,
});

    // Return the response with price information
    return res.status(200).json({
      message: 'Request status set to completed',
      request,
      cid,
      price
    });
  } catch (error) {
    console.error('Error updating request status to completed:', error);
    return res.status(500).json({ message: 'Failed to update request status' });
  }
}

export const fetchAppointmentsWithRequests = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Pagination parameters
    const { page = 1, limit = 10, search } = req.query; // Added `search` query parameter
    const pageNumber = Math.max(1, parseInt(page as string, 10));
    const pageSize = Math.max(1, parseInt(limit as string, 10));
    const skip = (pageNumber - 1) * pageSize;

    // Fetch all appointments
    const appointments = await AppointmentModel.find({}, 'orderId');

    // Extract order IDs from appointments
    const orderIds = appointments.map((appointment) => appointment.orderId);

    if (orderIds.length === 0) {
      return res.status(404).json({ message: 'No appointments found.', data: [] });
    }

    // Build request filter
    const requestFilter: any = {
      orderId: { $in: orderIds }, // Match order IDs
      type: 'Chat',
      stattusof: { $in: ['ongoing', 'ready', 'completed'] }, // Valid statuses
    };

    // Apply search filter if provided
    if (search) {
      requestFilter.chat_title = { $regex: new RegExp(search as string, 'i') }; // Case-insensitive search
    }

    // Fetch requests linked to appointments by orderId with filtering & pagination
    const requests = await RequestModel.find(
      requestFilter,
      'chat_title stattusof time orderId nameofservice date createdAt booktime endTime' // Fields to return
    )
      .sort({ booktime: -1 }) // Sort by booktime (newest first)
      .skip(skip) // Skip documents for pagination
      .limit(pageSize); // Limit the number of documents

    // Count total matching requests for pagination metadata
    const totalRequests = await RequestModel.countDocuments(requestFilter);

    // Combine appointments and their requests
    const combinedResults = requests.map((request) => {
      const { orderId } = request;
      const relatedAppointment = appointments.find((appointment) => appointment.orderId === orderId);

      return {
        appointment: relatedAppointment,
        request: request.toObject(),
      };
    });

    // Respond with combined data and pagination metadata
    return res.status(200).json({
      data: combinedResults,
      pagination: {
        total: totalRequests,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(totalRequests / pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching appointments and requests:', error);
    return res.status(500).json({
      message: 'Failed to fetch appointments and requests',
      error,
    });
  }
};



export const fetchWithdrawals = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc", status } = req.query;

    // Convert page, limit, and sort order to appropriate types
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    // Validate page and limit
    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({ message: "Invalid page or limit value" });
    }

    // Validate sorting field
    if (!["createdAt", "status"].includes(sortBy as string)) {
      return res.status(400).json({ message: "Invalid sortBy field" });
    }

    // Build the query
    const query: any = { type: "withdrawal" };
    if (status) {
      query.status = status;
    }

    // Calculate skip value
    const skip = (pageNumber - 1) * limitNumber;

    // Fetch withdrawals with pagination
    const withdrawals = await WalletHistory.find(query)
      .sort({ [sortBy as string]: sortDirection })
      .skip(skip)
      .limit(limitNumber);

    if (!withdrawals.length) {
      return res.status(404).json({ message: "No withdrawals found." });
    }

    // Fetch consultant data for each withdrawal based on `cid`
    const withdrawalDetails = await Promise.all(
      withdrawals.map(async (withdrawal) => {
        const consultant = await Consultant.findOne({ _id: withdrawal.cid });
        return {
          ...withdrawal.toObject(),
          consultant: consultant
            ? {
                fname: consultant.fname,
                lname: consultant.lname,
                email: consultant.email,
              }
            : null, // Handle cases where no consultant is found
        };
      })
    );

    // Get total count for the filtered documents
    const totalWithdrawals = await WalletHistory.countDocuments(query);

    // Calculate total pages
    const totalPages = Math.ceil(totalWithdrawals / limitNumber);

    // Respond with the results
    return res.status(200).json({
      currentPage: pageNumber,
      totalPages,
      totalWithdrawals,
      withdrawals: withdrawalDetails,
    });
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    return res.status(500).json({ message: "Failed to fetch withdrawals", error });
  }
};

export const completeDebit = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token is missing or invalid" });
    }

    // Extract and verify token
    const token = authHeader.split(" ")[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT secret key is not configured" });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }

    const { orderId } = req.body;

    // Validate request body
    if (!orderId) {
      return res.status(400).json({ message: "ID is required" });
    }

    // Find the pending withdrawal entry in wallet history using `id`
    const walletHistory = await WalletHistory.findOne({
      _id: orderId,
      type: "withdrawal",
      status: "pending",
    }).exec();

    if (!walletHistory) {
      return res.status(404).json({ message: "No pending withdrawal found for the specified ID" });
    }

    const { cid, amount } = walletHistory;

    // Find the associated wallet
    const wallet = await Wallet.findOne({ cid }).exec();

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // Check for sufficient available balance
    if (wallet.availableBalance < amount) {
      return res.status(400).json({ message: "Insufficient available balance" });
    }

    // Deduct from wallet
    wallet.balance -= amount;
    wallet.availableBalance -= amount;
    await wallet.save();

    // Update wallet history status to 'completed'
    walletHistory.status = "completed";
    await walletHistory.save();

    createNotification(cid.toString(), '001', 'consultant', 'Withdrawal', orderId.toString(), 'Withdrawal Approved', 'Your Withdrawal has been approved');

    console.log("Withdrawal completed and wallet updated:", wallet);

    return res.status(200).json({
      message: "Debit transaction completed successfully",
      wallet,
    });
  } catch (error) {
    console.error("Error completing debit transaction:", error);
    return res.status(500).json({
      message: "Failed to complete debit transaction",
      error: error,
    });
  }
};

export const fetchDataByType = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token is missing or invalid" });
    }

    // Extract and verify token
    const token = authHeader.split(" ")[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT secret key is not configured" });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }

    const { type, name, sortBy, fee, roles, location, typeFilter, department, verified, failed } = req.query;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (!type || (type !== "crew" && type !== "company")) {
      return res.status(400).json({ message: "Invalid type. Use 'crew' or 'company'." });
    }

    const skip = (page - 1) * limit;
    const Model = (type === "crew" ? Crew : Company) as mongoose.Model<any>;

    // Construct query filters
    const query: any = {};

    // Name filtering
    if (type === "crew" && name) {
      query.$or = [
        { firstName: { $regex: name as string, $options: "i" } },
        { lastName: { $regex: name as string, $options: "i" } },
      ];
    } else if (type === "company" && name) {
      query.name = { $regex: name as string, $options: "i" };
    }

    if (type === "crew" && roles) {
      query.role = { $in: (roles as string).split(",") };
    }

    if (type === "crew" && department) {
      query.department = { $regex: department as string, $options: "i" };
    }

    if (type === "company" && typeFilter) {
      query.type = { $regex: typeFilter as string, $options: "i" };
    }

    if (location) {
      const [country, state] = (location as string).split(",").map((item) => item.trim());
      if (country) query["location.country"] = { $regex: country, $options: "i" };
      if (state) query["location.state"] = { $regex: state, $options: "i" };
    }

    if (verified !== undefined) {
      query.verified = verified === "true";
    }

    if (fee) {
      query.fee = fee as string;
    }

    // Handle filtering by `failed`
    if (failed === "true") {
      query.failed = true; // Fetch only failed records
    } else {
      query.failed = { $ne: true }; // Exclude failed records by default
    }

    // Sorting logic
    const sortOptions: Record<string, 1 | -1> = { createdAt: -1, _id: 1 };

    if (sortBy === "department" && type === "crew") {
      sortOptions.department = 1;
    } else if (sortBy === "type" && type === "company") {
      sortOptions.type = 1;
    } else if (sortBy === "verified") {
      sortOptions.verified = -1;
    }

    // Fetch paginated and sorted data
    const data = await Model.find(query).sort(sortOptions).skip(skip).limit(limit);
    const totalRecords = await Model.countDocuments(query);

    return res.status(200).json({
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} data fetched successfully.`,
      data,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({
      message: "Failed to fetch data",
      error: error || error,
    });
  }
};






export const fetchWalletHistoryTotalsByCID = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Extract `cid` from query parameters
    const { cid } = req.query;

    // Validate `cid`
    if (!cid || typeof cid !== 'string') {
      return res.status(400).json({ message: 'CID is required and must be a string.' });
    }

    const currentYear = new Date().getFullYear();

    // Fetch total amount where type is 'deposit' for the specific CID
    const totalDeposits = await WalletHistory.aggregate([
      { $match: { type: 'deposit', cid } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]);

    // Fetch total amount where type is 'withdrawal' and status is 'pending' for the specific CID
    const totalPendingWithdrawals = await WalletHistory.aggregate([
      { $match: { type: 'withdrawal', status: 'pending', cid } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]);

    // Fetch total amount where type is 'withdrawal' and status is 'completed' for the specific CID
    const totalCompletedWithdrawals = await WalletHistory.aggregate([
      { $match: { type: 'withdrawal', status: 'completed', cid } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]);

    // Fetch total deposits grouped by month for the current year
    const monthlyDepositTotals = await WalletHistory.aggregate([
      {
        $match: {
          type: 'deposit',
          cid,
          createdAt: {
            $gte: new Date(`${currentYear}-01-01T00:00:00Z`),
            $lt: new Date(`${currentYear + 1}-01-01T00:00:00Z`),
          },
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id': 1 } }, // Sort by month in ascending order
    ]);

    // Map results to include month names
    const monthlyDepositsFormatted = monthlyDepositTotals.map((monthData) => ({
      month: monthData._id,
      totalAmount: monthData.totalAmount,
    }));

    // Format the response totals with defaults to avoid undefined results
    const response = {
      totalDeposits: totalDeposits[0]?.totalAmount || 0,
      totalPendingWithdrawals: (totalPendingWithdrawals[0]?.totalAmount/100) || 0,
      totalCompletedWithdrawals: (totalCompletedWithdrawals[0]?.totalAmount/100) || 0,
      monthlyDeposits: monthlyDepositsFormatted,
    };

    return res.status(200).json({
      message: 'Wallet history totals fetched successfully',
      cid,
      totals: response,
    });
  } catch (error) {
    console.error('Error fetching wallet history totals:', error);
    return res.status(500).json({
      message: 'Failed to fetch wallet history totals',
      error: error,
    });
  }
};

export const fetchAllWithdrawals = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch all withdrawals
    const withdrawals = await WalletHistory.find({ type: 'withdrawal' }).exec();

    if (!withdrawals.length) {
      return res.status(404).json({ message: 'No withdrawals found.' });
    }

    // Enrich withdrawal data
    const enrichedWithdrawals = withdrawals.map((withdrawal) => ({
      ...withdrawal.toObject(),
    }));

    return res.status(200).json({
      message: 'All withdrawals fetched successfully.',
      withdrawals: enrichedWithdrawals,
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching withdrawals.',
      error: error,
    });
  }
};


export const fetchAllDeposits = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch all deposits
    const deposits = await WalletHistory.find({ type: 'deposit' }).exec();

    if (!deposits.length) {
      return res.status(404).json({ message: 'No deposits found.' });
    }

    // Fetch related request data using orderId
    const enrichedDeposits = await Promise.all(
      deposits.map(async (deposit) => {
        if (deposit.orderId) {
          const requestData = await RequestModel.findOne({ orderId: deposit.orderId })
            .select('chat_title type movie_title nameofservice') // Only select needed fields
            .exec();
          return {
            ...deposit.toObject(),
            depositInNaira: (deposit.amount/100),
            chat_title: requestData?.chat_title || null,
            type: requestData?.type || null,
            movie_title: requestData?.movie_title || null,
            nameofservice: requestData?.nameofservice || null,
          };
        }
        return {
          ...deposit.toObject(),
          chat_title: null,
          type: null,
          movie_title: null,
          nameofservice: null,
        };
      })
    );

    return res.status(200).json({
      message: 'All deposits fetched successfully.',
      deposits: enrichedDeposits,
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching deposits.',
      error: error,
    });
  }
};

export const fetchTotalTransactions = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Perform aggregation for both deposit and withdrawal in parallel
    const [withdrawalsResult, depositsResult] = await Promise.all([
      WalletHistory.aggregate([
        { $match: { type: 'withdrawal', status: 'completed' } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
      ]),
      WalletHistory.aggregate([
        { $match: { type: 'deposit' } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
      ]),
    ]);

    const totalWithdrawals = (withdrawalsResult[0]?.totalAmount/100) || 0;
    const totalDeposits = (depositsResult[0]?.totalAmount/100) || 0;

    return res.status(200).json({
      message: 'Transaction totals fetched successfully.',
      totals: {
        withdrawals: totalWithdrawals,
        deposits: totalDeposits,
      },
    });
  } catch (error) {
    console.error('Error fetching transaction totals:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching transaction totals.',
      error: error,
    });
  }
};

export const fetchWithdrawalById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token is missing or invalid" });
    }

    // Extract and verify token
    const token = authHeader.split(" ")[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT secret key is not configured" });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }

    const { id } = req.params;

    // Validate ID
    if (!id) {
      return res.status(400).json({ message: "ID is required to fetch the withdrawal." });
    }

    // Fetch withdrawal by ID
    const withdrawal = await WalletHistory.findOne({ _id: id, type: "withdrawal" });

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found with the given ID." });
    }

    const { cid } = withdrawal;

    // Fetch consultant details using cid
    const consultant = await Consultant.findOne({ _id: cid }).select("fname lname email");

    if (!consultant) {
      return res.status(404).json({
        message: "Associated consultant not found for the given CID.",
      });
    }

    return res.status(200).json({
      message: "Withdrawal fetched successfully.",
      withdrawal,
      withdrawalInNaira: (withdrawal.amount/100),
      consultant: {
        fname: consultant.fname,
        lname: consultant.lname,
        email: consultant.email,
      },
    });
  } catch (error) {
    console.error("Error fetching withdrawal:", error);
    return res.status(500).json({
      message: "An error occurred while fetching the withdrawal.",
      error: error,
    });
  }
};

export const fetchDepositById = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    // Validate ID
    if (!id) {
      return res.status(400).json({ message: 'ID is required to fetch the deposit.' });
    }

    // Fetch deposit by ID
    const deposit = await WalletHistory.findOne({ _id: id, type: 'deposit' });

    if (!deposit) {
      return res.status(404).json({ message: 'Deposit not found with the given ID.' });
    }

    return res.status(200).json({
      message: 'Deposit fetched successfully.',
      depositInNaira: (deposit.amount/100),
      deposit,
    });
  } catch (error) {
    console.error('Error fetching deposit:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching the deposit.',
      error: error,
    });
  }
};

export const setWithdrawalStatusToFailed = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    // Validate ID
    if (!id) {
      return res.status(400).json({ message: 'ID is required to update the withdrawal status.' });
    }

    // Find and update the withdrawal
    const withdrawal = await WalletHistory.findOneAndUpdate(
      { _id: id, type: 'withdrawal' }, // Filter by ID and type
      { status: 'failed', updatedAt: Date.now() }, // Update status to failed and set updatedAt
      { new: true } // Return the updated document
    );

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found with the given ID.' });
    }

    return res.status(200).json({
      message: 'Withdrawal status updated to failed successfully.',
      withdrawalInNaira: (withdrawal.amount/100),
      withdrawal,
    });
  } catch (error) {
    console.error('Error updating withdrawal status:', error);
    return res.status(500).json({
      message: 'An error occurred while updating the withdrawal status.',
      error: error,
    });
  }
};

export const deleteCrewByUserId = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { userId } = req.params;

    // Validate userId parameter
    if (!userId) {
      return res.status(400).json({ message: "User ID is required for deletion." });
    }
    
    // Find crew record matching the given userId  
    const crewed = await Crew.findOne({ userId }).exec();
    
    if (!crewed) {
      return res.status(404).json({ message: "Crew member not found." });
    }
    
    // Function to capitalize the first letter of a string
    const capitalize = (str: string) => 
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
    
    const firstNameCap = capitalize(crewed.firstName);
    
    await sendEmail({
      to: crewed.email, 
      subject: 'Verification Unsuccessful – Resubmit Your Application',
      text: `Dear ${firstNameCap},
    
    Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:
    
    - Not enough work done – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.
    - Mismatch in roles – Please only list roles you have actually worked in.
    - ID verification issues – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.
    - Company verification issues – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.
    - Unreachable phone number – We were unable to confirm your phone number.
    - No Clientele - If you registered as a company, please list atleast one client you have worked with
    
    Your application has been deleted, but you are welcome to resubmit with the correct details at any time.
    
    If you believe this was a mistake, please contact us at support@nollywoodfilmmaker.com and we will review your case.
    
    Best Regards,  
    Nollywood Filmmaker
      `,
      html: `
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Unsuccessful</title>
      <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 20px;
        color: #333;
      }
      .container {
        max-width: 600px;
        background: #ffffff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        margin: auto;
      }
      .header img {
        width: 100%;
        max-width: 600px;
        border-radius: 8px;
      }
      h1 {
        color: #333;
      }
      p {
        font-size: 16px;
        line-height: 1.5;
      }
      .footer {
        margin-top: 20px;
        font-size: 14px;
        color: #777;
      }
      </style>
      </head>
      <body>
    
      <div class="container">
      <div class="header">
        <a href="https://nollywoodfilmmaker.com">
          <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
               alt="Nollywood Filmmaker Database">
        </a>
      </div>
    
      <h1>Dear ${firstNameCap},</h1>
    
      <p>Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:</p>
    
      <ul>
        <li><strong>Not enough work done</strong> – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.</li>
        <li><strong>Mismatch in roles</strong> – Please only list roles you have actually worked in.</li>
        <li><strong>ID verification issues</strong> – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.</li>
        <li><strong>Company verification issues</strong> – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.</li>
        <li><strong>Unreachable phone number</strong> – We were unable to confirm your phone number.</li>
        <li><strong>No Clientele</strong> – If you registered as a company, please list atleast one client you have worked with.</li>
      </ul>
    
      <p>Your application has been deleted, but you are welcome to resubmit with the correct details at any time.</p>
    
      <p>If you believe this was a mistake, please contact us at <a href="mailto:support@nollywoodfilmmaker.com">support@nollywoodfilmmaker.com</a> and we will review your case.</p>
    
      <p>Best Regards,</p>
      <p><strong>Nollywood Filmmaker</strong></p>
    
      <p class="footer">Best regards,<br><strong>Nollywood Filmmaker</strong></p>
      </div>
    
      </body>
      </html>
      `,
    });    

    // Delete crew records matching the given userId
    const result = await Crew.deleteMany({ userId }).exec();

    const account = await CrewCompany.deleteMany({ _id: userId }).exec();

    // Check if any records were deleted
    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "No crew records found for the specified User ID.",
      });
    }



    // Respond with a success message
    return res.status(200).json({
      message: `Complete ${result.deletedCount} crew record(s) deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting crew records:", error);
    return res.status(500).json({
      message: "An error occurred while deleting crew records.",
      error,
    });
  }
};

export const deleteCompanyByUserId = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { userId } = req.params;

    // Validate userId parameter
    if (!userId) {
      return res.status(400).json({ message: "User ID is required for deletion." });
    }

    const company = await Company.findOne({ userId }).exec();
    
    if (!company) {
      return res.status(404).json({ message: "Crew member not found." });
    }
    
    // Function to capitalize the first letter of a string
    const capitalize = (str: string) => 
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
    
    const firstNameCap = capitalize(company.name);
    
    await sendEmail({
      to: company.email, 
      subject: 'Verification Unsuccessful – Resubmit Your Application',
      text: `Dear ${firstNameCap},
    
    Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:
    
    - Not enough work done – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.
    - Mismatch in roles – Please only list roles you have actually worked in.
    - ID verification issues – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.
    - Company verification issues – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.
    - Unreachable phone number – We were unable to confirm your phone number.
    - No Clientele - If you registered as a company, please list atleast one client you have worked with.
    
    Your application has been deleted, but you are welcome to resubmit with the correct details at any time.
    
    If you believe this was a mistake, please contact us at support@nollywoodfilmmaker.com and we will review your case.
    
    Best Regards,  
    Nollywood Filmmaker
      `,
      html: `
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Unsuccessful</title>
      <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 20px;
        color: #333;
      }
      .container {
        max-width: 600px;
        background: #ffffff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        margin: auto;
      }
      .header img {
        width: 100%;
        max-width: 600px;
        border-radius: 8px;
      }
      h1 {
        color: #333;
      }
      p {
        font-size: 16px;
        line-height: 1.5;
      }
      .footer {
        margin-top: 20px;
        font-size: 14px;
        color: #777;
      }
      </style>
      </head>
      <body>
    
      <div class="container">
      <div class="header">
        <a href="https://nollywoodfilmmaker.com">
          <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
               alt="Nollywood Filmmaker Database">
        </a>
      </div>
    
      <h1>Dear ${firstNameCap},</h1>
    
      <p>Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:</p>
    
      <ul>
        <li><strong>Not enough work done</strong> – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.</li>
        <li><strong>Mismatch in roles</strong> – Please only list roles you have actually worked in.</li>
        <li><strong>ID verification issues</strong> – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.</li>
        <li><strong>Company verification issues</strong> – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.</li>
        <li><strong>Unreachable phone number</strong> – We were unable to confirm your phone number.</li>
        <li><strong>No Clientele</strong> – If you registered as a company, please list atleast one client you have worked with.</li>
      </ul>
    
      <p>Your application has been deleted, but you are welcome to resubmit with the correct details at any time.</p>
    
      <p>If you believe this was a mistake, please contact us at <a href="mailto:support@nollywoodfilmmaker.com">support@nollywoodfilmmaker.com</a> and we will review your case.</p>
    
      <p>Best Regards,</p>
      <p><strong>Nollywood Filmmaker</strong></p>
    
      <p class="footer">Best regards,<br><strong>Nollywood Filmmaker</strong></p>
      </div>
    
      </body>
      </html>
      `,
    });    

    // Delete companies matching the given userId
    const result = await Company.deleteMany({ userId }).exec();

    const account = await CrewCompany.deleteMany({ _id: userId }).exec();

    // Check if any companies were deleted
    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "No company records found for the specified User ID.",
      });
    }

    // Respond with a success message
    return res.status(200).json({
      message: `Complete ${result.deletedCount} company record(s) deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting company records:", error);
    return res.status(500).json({
      message: "An error occurred while deleting company records.",
      error,
    });
  }
};


export const deleteCrewCompanyById = async (req: Request, res: Response): Promise<Response> => {
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

    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "ID is required for deletion." });
    }

    const crewCompany = await CrewCompany.findById(id);
    if (!crewCompany) {
      return res.status(404).json({ message: "CrewCompany record not found." });
    }

    // Count associated Crew and Company records
    const crewCount = await Crew.countDocuments({ userId: id });
    const companyCount = await Company.countDocuments({ userId: id });

     if (crewCount > 0) {
      const crewed = await Crew.findOne({ userId: id }).exec();

      if (!crewed) {
        return res.status(404).json({ message: "Crew member not found." });
      }

      const capitalize = (str: string) => 
        str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
      
      const firstNameCap = capitalize(crewed.firstName);
      
      await sendEmail({
        to: crewed.email, 
        subject: 'Verification Unsuccessful – Resubmit Your Application',
        text: `Dear ${firstNameCap},
      
      Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:
      
      - Not enough work done – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.
      - Mismatch in roles – Please only list roles you have actually worked in.
      - ID verification issues – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.
      - Company verification issues – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.
      - Unreachable phone number – We were unable to confirm your phone number.
      
      Your application has been deleted, but you are welcome to resubmit with the correct details at any time.
      
      If you believe this was a mistake, please contact us at support@nollywoodfilmmaker.com and we will review your case.
      
      Best Regards,  
      Nollywood Filmmaker
        `,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Unsuccessful</title>
        <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .container {
          max-width: 600px;
          background: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          margin: auto;
        }
        .header img {
          width: 100%;
          max-width: 600px;
          border-radius: 8px;
        }
        h1 {
          color: #333;
        }
        p {
          font-size: 16px;
          line-height: 1.5;
        }
        .footer {
          margin-top: 20px;
          font-size: 14px;
          color: #777;
        }
        </style>
        </head>
        <body>
      
        <div class="container">
        <div class="header">
          <a href="https://nollywoodfilmmaker.com">
            <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
                 alt="Nollywood Filmmaker Database">
          </a>
        </div>
      
        <h1>Dear ${firstNameCap},</h1>
      
        <p>Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:</p>
      
        <ul>
          <li><strong>Not enough work done</strong> – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.</li>
          <li><strong>Mismatch in roles</strong> – Please only list roles you have actually worked in.</li>
          <li><strong>ID verification issues</strong> – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.</li>
          <li><strong>Company verification issues</strong> – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.</li>
          <li><strong>Unreachable phone number</strong> – We were unable to confirm your phone number.</li>
        </ul>
      
        <p>Your application has been deleted, but you are welcome to resubmit with the correct details at any time.</p>
      
        <p>If you believe this was a mistake, please contact us at <a href="mailto:support@nollywoodfilmmaker.com">support@nollywoodfilmmaker.com</a> and we will review your case.</p>
      
        <p>Best Regards,</p>
        <p><strong>Nollywood Filmmaker</strong></p>
      
        <p class="footer">Best regards,<br><strong>Nollywood Filmmaker</strong></p>
        </div>
      
        </body>
        </html>
        `,
      });    
    }


   if (companyCount > 0) {
    const company = await Company.findOne({ userId: id }).exec();
    
    if (!company) {
      return res.status(404).json({ message: "Crew member not found." });
    }
    
    // Function to capitalize the first letter of a string
    const capitalize = (str: string) => 
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
    
    const firstNameCap = capitalize(company.name);
    
    await sendEmail({
      to: company.email, 
      subject: 'Verification Unsuccessful – Resubmit Your Application',
      text: `Dear ${firstNameCap},
    
    Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:
    
    - Not enough work done – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.
    - Mismatch in roles – Please only list roles you have actually worked in.
    - ID verification issues – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.
    - Company verification issues – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.
    - Unreachable phone number – We were unable to confirm your phone number.
    
    Your application has been deleted, but you are welcome to resubmit with the correct details at any time.
    
    If you believe this was a mistake, please contact us at support@nollywoodfilmmaker.com and we will review your case.
    
    Best Regards,  
    Nollywood Filmmaker
      `,
      html: `
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Unsuccessful</title>
      <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 20px;
        color: #333;
      }
      .container {
        max-width: 600px;
        background: #ffffff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        margin: auto;
      }
      .header img {
        width: 100%;
        max-width: 600px;
        border-radius: 8px;
      }
      h1 {
        color: #333;
      }
      p {
        font-size: 16px;
        line-height: 1.5;
      }
      .footer {
        margin-top: 20px;
        font-size: 14px;
        color: #777;
      }
      </style>
      </head>
      <body>
    
      <div class="container">
      <div class="header">
        <a href="https://nollywoodfilmmaker.com">
          <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
               alt="Nollywood Filmmaker Database">
        </a>
      </div>
    
      <h1>Dear ${firstNameCap},</h1>
    
      <p>Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:</p>
    
      <ul>
        <li><strong>Not enough work done</strong> – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.</li>
        <li><strong>Mismatch in roles</strong> – Please only list roles you have actually worked in.</li>
        <li><strong>ID verification issues</strong> – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.</li>
        <li><strong>Company verification issues</strong> – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.</li>
        <li><strong>Unreachable phone number</strong> – We were unable to confirm your phone number.</li>
      </ul>
    
      <p>Your application has been deleted, but you are welcome to resubmit with the correct details at any time.</p>
    
      <p>If you believe this was a mistake, please contact us at <a href="mailto:support@nollywoodfilmmaker.com">support@nollywoodfilmmaker.com</a> and we will review your case.</p>
    
      <p>Best Regards,</p>
      <p><strong>Nollywood Filmmaker</strong></p>
    
      <p class="footer">Best regards,<br><strong>Nollywood Filmmaker</strong></p>
      </div>
    
      </body>
      </html>
      `,
    });  
    }

    // Delete associated records
    const crewDeletionResult = await Crew.deleteMany({ userId: id });
    const companyDeletionResult = await Company.deleteMany({ userId: id });
    await crewCompany.deleteOne();

    return res.status(200).json({
      message: "CrewCompany and associated records deleted successfully.",
      deletedCrewCount: crewDeletionResult.deletedCount,
      deletedCompanyCount: companyDeletionResult.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting CrewCompany and associated records:", error);
    return res.status(500).json({
      message: "An error occurred while attempting to delete the records.",
      error,
    });
  }
};

export const FailedCrewCompanyById = async (req: Request, res: Response): Promise<Response> => {
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

    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;
    const { note } = req.body;

    if (!id) {
      return res.status(400).json({ message: "ID is required for Failed Rewiew." });
    }

    if(!note) {
      return res.status(400).json({ message: "Note is required for Failed Rewiew." });
    } 

    const crewCompany = await CrewCompany.findById(id);
    if (!crewCompany) {
      return res.status(404).json({ message: "CrewCompany record not found." });
    }

    // Count associated Crew and Company records
    const crewCount = await Crew.countDocuments({ userId: id });
    const companyCount = await Company.countDocuments({ userId: id });

     if (crewCount > 0) {
      const crewed = await Crew.findOne({ userId: id }).exec();

      if (!crewed) {
        return res.status(404).json({ message: "Crew member not found." });
      }

      const capitalize = (str: string) => 
        str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
      
      const firstNameCap = capitalize(crewed.firstName);

      crewed.failed = true;
      await crewed.save();
      
      await sendEmail({
        to: crewed.email, 
        subject: 'Verification Unsuccessful – Resubmit Your Application',
        text: `Dear ${firstNameCap},
      
      Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:
      
      - Not enough work done – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.
      - Mismatch in roles – Please only list roles you have actually worked in.
      - ID verification issues – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.
      - Company verification issues – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.
      - Unreachable phone number – We were unable to confirm your phone number.
      
      Your application has been deleted, but you are welcome to resubmit with the correct details at any time.
      
      If you believe this was a mistake, please contact us at support@nollywoodfilmmaker.com and we will review your case.
      
      Best Regards,  
      Nollywood Filmmaker
        `,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Unsuccessful</title>
        <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .container {
          max-width: 600px;
          background: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          margin: auto;
        }
        .header img {
          width: 100%;
          max-width: 600px;
          border-radius: 8px;
        }
        h1 {
          color: #333;
        }
        p {
          font-size: 16px;
          line-height: 1.5;
        }
        .footer {
          margin-top: 20px;
          font-size: 14px;
          color: #777;
        }
        </style>
        </head>
        <body>
      
        <div class="container">
        <div class="header">
          <a href="https://nollywoodfilmmaker.com">
            <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
                 alt="Nollywood Filmmaker Database">
          </a>
        </div>
      
        <h1>Dear ${firstNameCap},</h1>
      
        <p>Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:</p>
      
        <ul>
          <li><strong>Not enough work done</strong> – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.</li>
          <li><strong>Mismatch in roles</strong> – Please only list roles you have actually worked in.</li>
          <li><strong>ID verification issues</strong> – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.</li>
          <li><strong>Company verification issues</strong> – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.</li>
          <li><strong>Unreachable phone number</strong> – We were unable to confirm your phone number.</li>
        </ul>
      
        <p>Your application has been deleted, but you are welcome to resubmit with the correct details at any time.</p>
      
        <p>If you believe this was a mistake, please contact us at <a href="mailto:support@nollywoodfilmmaker.com">support@nollywoodfilmmaker.com</a> and we will review your case.</p>
      
        <p>Best Regards,</p>
        <p><strong>Nollywood Filmmaker</strong></p>
      
        <p class="footer">Best regards,<br><strong>Nollywood Filmmaker</strong></p>
        </div>
      
        </body>
        </html>
        `,
      });
    }


   if (companyCount > 0) {
    const company = await Company.findOne({ userId: id }).exec();
    
    if (!company) {
      return res.status(404).json({ message: "Crew member not found." });
    }
    
    // Function to capitalize the first letter of a string
    const capitalize = (str: string) => 
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
    
    const firstNameCap = capitalize(company.name);

    company.failed = true;
    await company.save();
    
    await sendEmail({
      to: company.email, 
      subject: 'Verification Unsuccessful – Resubmit Your Application',
      text: `Dear ${firstNameCap},
    
    Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:
    
    - Not enough work done – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.
    - Mismatch in roles – Please only list roles you have actually worked in.
    - ID verification issues – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.
    - Company verification issues – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.
    - Unreachable phone number – We were unable to confirm your phone number.
    
    Your application has been deleted, but you are welcome to resubmit with the correct details at any time.
    
    If you believe this was a mistake, please contact us at support@nollywoodfilmmaker.com and we will review your case.
    
    Best Regards,  
    Nollywood Filmmaker
      `,
      html: `
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Unsuccessful</title>
      <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 20px;
        color: #333;
      }
      .container {
        max-width: 600px;
        background: #ffffff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        margin: auto;
      }
      .header img {
        width: 100%;
        max-width: 600px;
        border-radius: 8px;
      }
      h1 {
        color: #333;
      }
      p {
        font-size: 16px;
        line-height: 1.5;
      }
      .footer {
        margin-top: 20px;
        font-size: 14px;
        color: #777;
      }
      </style>
      </head>
      <body>
    
      <div class="container">
      <div class="header">
        <a href="https://nollywoodfilmmaker.com">
          <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
               alt="Nollywood Filmmaker Database">
        </a>
      </div>
    
      <h1>Dear ${firstNameCap},</h1>
    
      <p>Thank you for applying to the Nollywood Filmmaker Database. Unfortunately, we were unable to verify your application due to one or more of the following reasons:</p>
    
      <ul>
        <li><strong>Not enough work done</strong> – Please indicate your work experience and provide links. If there’s no link, specify the exhibition platform where your work is available.</li>
        <li><strong>Mismatch in roles</strong> – Please only list roles you have actually worked in.</li>
        <li><strong>ID verification issues</strong> – Your ID documents could not be verified, the face on your ID doesn’t match your profile, or the name you registered with doesn’t match your ID. Ensure your profile has a headshot.</li>
        <li><strong>Company verification issues</strong> – If you registered as a company, your company registration certificate could not be verified, or the company name does not match the certificate.</li>
        <li><strong>Unreachable phone number</strong> – We were unable to confirm your phone number.</li>
      </ul>
    
      <p>Your application has been deleted, but you are welcome to resubmit with the correct details at any time.</p>
    
      <p>If you believe this was a mistake, please contact us at <a href="mailto:support@nollywoodfilmmaker.com">support@nollywoodfilmmaker.com</a> and we will review your case.</p>
    
      <p>Best Regards,</p>
      <p><strong>Nollywood Filmmaker</strong></p>
    
      <p class="footer">Best regards,<br><strong>Nollywood Filmmaker</strong></p>
      </div>
    
      </body>
      </html>
      `,
    });  
    }

    // Delete associated records
    const crewDeletionResult = await Crew.deleteMany({ userId: id });
    const companyDeletionResult = await Company.deleteMany({ userId: id });
    await crewCompany.deleteOne();

    return res.status(200).json({
      message: "CrewCompany and associated records deleted successfully.",
      deletedCrewCount: crewDeletionResult.deletedCount,
      deletedCompanyCount: companyDeletionResult.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting CrewCompany and associated records:", error);
    return res.status(500).json({
      message: "An error occurred while attempting to delete the records.",
      error,
    });
  }
};



export const getResolvesByOrderId = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    const resolves = await Resolve.find({ orderId });

    if (!resolves.length) {
      return res.status(404).json({ message: "No resolves found for this Order ID" });
    }

    return res.status(200).json({ message: "Resolves fetched successfully", resolves });
  } catch (error) {
    console.error("Error fetching resolves:", error);
    return res.status(500).json({ message: "Failed to fetch resolves", error });
  }
};

export const getEmailList = async (req: Request, res: Response) => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Extract pagination parameters
    const { page = 1, limit = 50 } = req.query;
    const pageNumber = Math.max(1, parseInt(page as string, 10));
    const pageSize = Math.max(1, parseInt(limit as string, 10));
    const skip = (pageNumber - 1) * pageSize;

    // Fetch paginated email list
    const emails = await EmailList.find().skip(skip).limit(pageSize);

    // Count total records
    const totalRecords = await EmailList.countDocuments();

    res.status(200).json({
      message: "Email list retrieved successfully.",
      data: emails,
      pagination: {
        totalRecords,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalRecords / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching email list:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


export const fetchAttendanceByRoom = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ message: "roomId is required" });
    }

    // Fetch attendance records matching the roomId
    const attendanceRecords = await Attendance.find({ roomId: roomId });

    if (!attendanceRecords.length) {
      return res.status(404).json({ message: "No attendance records found for this room" });
    }

    return res.status(200).json({ attendance: attendanceRecords });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return res.status(500).json({ message: "Failed to fetch attendance", error });
  }
};

export const setApiVettingTrue = async (req: Request, res: Response) => {
  const { userId } = req.params; // Get userId from request parameters
  const { apiVetting } = req.body; // Get type from query parameters

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }


    const crew = await Crew.findOne({ userId });

    if (!crew) {
      return res.status(404).json({ message: "Crew member not found" });
    }

    // Set apiVetting to true
    crew.apiVetting = apiVetting;

    await crew.save();

    return res.status(200).json({ message: "apiVetting set to true", crew });
  } catch (error) {
    console.error("Error updating apiVetting:", error);
    return res.status(500).json({ message: "Error updating apiVetting", error });
  }
};

export const updateCrewVerificationStatus = async (req: Request, res: Response) => {
  const { userId } = req.params; // Get userId from request parameters
  const { verified } = req.body; // Get verified status from request body

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }


    const crew = await Crew.findOne({ userId });

    if (!crew) {
      return res.status(404).json({ message: "Crew member not found" });
    }

    // If `apiVetting` is true, set `verified` to true; otherwise, set it to false
    if(crew.apiVetting) {
      crew.verified = verified;
    }
    else {    
      return res.status(200).json({ message: "Can Not Perform Step 2 Verification Until step 1 is true" });
    }

    const profileImageURL = `${crew.propic}`;

    const fullname = `${crew.firstName} ${crew.lastName}`

    const badgeURL = await generateBadge('crew', profileImageURL, 'https://nollywoodfilmmaker.com', fullname);

    crew.badgelink = badgeURL;

    await crew.save();



    const capitalize = (str: string) => 
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";

    const firstNameCap = capitalize(crew.firstName);
    const lastNameCap = capitalize(crew.lastName);

    await sendEmail({
      to: crew.email,
      subject: 'Your Nollywood Filmmaker Profile is Now Verified!',
      text: `Dear ${firstNameCap} ${lastNameCap},

            Congratulations! Your profile on the Nollywood Filmmaker Database has been successfully verified. You are now officially part of the most dynamic network of industry professionals.
            You can view your verified profile here: https://nollywoodfilmmaker.com/filmmaker-database/profile/crew/${crew.userId}

            Click to Download your Nollywood Filmmaker Verified Badge Below

            <a href="${badgeURL}">Your Badge</a>
            Feel free to share your profile on social media and let others know about your services. Remember you can edit and update your profile anytime.
            
            Best
            Nollywood Filmmaker Database
      `,
      html: `
      <!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Nollywood Filmmaker Database</title>
<style>
body {
  font-family: Arial, sans-serif;
  background-color: #f4f4f4;
  margin: 0;
  padding: 20px;
  color: #333;
}
.container {
  max-width: 600px;
  background: #ffffff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  margin: auto;
}
.header img {
  width: 100%;
  max-width: 600px;
  border-radius: 8px;
}
h1 {
  color: #333;
}
p {
  font-size: 16px;
  line-height: 1.5;
}
.footer {
  margin-top: 20px;
  font-size: 14px;
  color: #777;
}
</style>
</head>
<body>

<div class="container">
<div class="header">
  <a href="https://nollywoodfilmmaker.com">
    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
         alt="Nollywood Filmmaker Database">
  </a>
</div>

<h1>Dear ${firstNameCap} ${lastNameCap},</h1>

<p>Congratulations! Your profile on the Nollywood Filmmaker Database has been successfully verified. You are now officially part of the most dynamic network of industry professionals.</p>
<p>You can view your verified profile here: https://nollywoodfilmmaker.com/filmmaker-database/profile/crew/${crew.userId}</p>

<p>Click to Download your Nollywood Filmmaker Verified Badge Below</p>

  <a href="${badgeURL}">
    <img src="${badgeURL}" 
         alt="Nollywood Filmmaker Database">
  </a>

<p>Feel free to share your profile on social media and let others know about your services. Remember you can edit and update your profile anytime.</p>

<p>Best</p>
<p>Nollywood Filmmaker Database</p>
<p class="footer">Best regards,<br><strong>Nollywood Filmmaker Database</strong></p>
</div>

</body>
</html>
      `,
    });

    return res.status(200).json({ message: "Verification status updated", crew });
  } catch (error) {
    console.error("Error updating verification status:", error);
    return res.status(500).json({ message: "Error updating verification status", error });
  }
};

export const setCompanyApiVettingTrue = async (req: Request, res: Response) => {
  const { userId } = req.params; // Get userId from request parameters
  const { apiVetting } = req.body; // Get type from query parameters

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const company = await Company.findOne({ userId });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Set apiVetting to true
    company.apiVetting = apiVetting;

    await company.save();

    return res.status(200).json({ message: "apiVetting set to true", company });
  } catch (error) {
    console.error("Error updating apiVetting:", error);
    return res.status(500).json({ message: "Error updating apiVetting", error });
  }
};


export const updateVerificationStatus = async (req: Request, res: Response) => {
  const { userId } = req.params; // Get userId from request parameters
  const { verified } = req.body; // Get verified status from request body

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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }


    const company = await Company.findOne({ userId });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // If `apiVetting` is true, set `verified` to true; otherwise, set it to false
    if(company.apiVetting) {
      company.verified = verified;
    }
    else {
      return res.status(200).json({ message: "Can Not Perform Step 2 Verification Until step 1 is true" });
    }

    const profileImageURL = `${company.propic}`;

    const fullname = `${company.name}`

    const badgeURL = await generateBadge('company', profileImageURL, 'https://nollywoodfilmmaker.com', fullname, fullname);
    
    company.badgelink = badgeURL;

    await company.save();



    const capitalize = (str: string) => 
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";

    const companyNameCap = capitalize(company.name);

      await sendEmail({
        to: company.email,
        subject: 'Your Nollywood Filmmaker Profile is Now Verified!',
        text: `Dear ${companyNameCap},

              Congratulations! Your profile on the Nollywood Filmmaker Database has been successfully verified. You are now officially part of the most dynamic network of industry professionals.
              You can view your verified profile here: You can view your verified profile here: https://nollywoodfilmmaker.com/filmmaker-database/profile/company/${company.userId} 

              Click to Download your Nollywood Filmmaker Verified Badge Below

              <a href="${badgeURL}">Your Badge</a>

              Feel free to share your profile on social media and let others know about your services. Remember you can edit and update your profile anytime.
              
              Best
              Nollywood Filmmaker Database
        `,
        html: `
        <!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Nollywood Filmmaker Database</title>
<style>
  body {
    font-family: Arial, sans-serif;
    background-color: #f4f4f4;
    margin: 0;
    padding: 20px;
    color: #333;
  }
  .container {
    max-width: 600px;
    background: #ffffff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    margin: auto;
  }
  .header img {
    width: 100%;
    max-width: 600px;
    border-radius: 8px;
  }
  h1 {
    color: #333;
  }
  p {
    font-size: 16px;
    line-height: 1.5;
  }
  .footer {
    margin-top: 20px;
    font-size: 14px;
    color: #777;
  }
</style>
</head>
<body>

<div class="container">
  <div class="header">
    <a href="https://nollywoodfilmmaker.com">
      <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
           alt="Nollywood Filmmaker Database">
    </a>
  </div>

  <h1>Dear ${companyNameCap},</h1>

  <p>Congratulations! Your profile on the Nollywood Filmmaker Database has been successfully verified. You are now officially part of the most dynamic network of industry professionals.</p>
  <p>You can view your verified profile here: https://nollywoodfilmmaker.com/filmmaker-database/profile/company/${company.userId} </p>

  <p>Click to Download your Nollywood Filmmaker Verified Badge Below</p>

    <a href="${badgeURL}">
    <img src="${badgeURL}" 
         alt="Nollywood Filmmaker Database">
  </a>
  <p>Feel free to share your profile on social media and let others know about your services. Remember you can edit and update your profile anytime.</p>

  <p>Best</p>
  <p>Nollywood Filmmaker Database</p>
  <p class="footer">Best regards,<br><strong>Nollywood Filmmaker Database</strong></p>
</div>

</body>
</html>
        `,
      });

    return res.status(200).json({ message: "Verification status updated", company });
  } catch (error) {
    console.error("Error updating verification status:", error);
    return res.status(500).json({ message: "Error updating verification status", error });
  }
};

const loadImageFromURL = async (url: string) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return loadImage(Buffer.from(response.data));
};

export const generateBadge = async (
  type: string,
  profileImageURL: string,
  qrData: string,
  crewname?: string,
  company?: string
): Promise<string> => {
  try {
    const width = 1200, height = 1500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Load background template
    const templateURL = 'https://ideaafricabucket.s3.eu-north-1.amazonaws.com/new_verification_bg.JPG';
    const template = await loadImage(templateURL);
    ctx.drawImage(template, 0, 0, width, height);

    // Load profile picture
    const profilePic = await loadImage(profileImageURL);
    const circleX = width / 2, circleY = 650, radius = 270;

    // Crop from the center
    const minSide = Math.min(profilePic.width, profilePic.height);
    const sx = (profilePic.width - minSide) / 2;
    const sy = (profilePic.height - minSide) / 2;
    const sWidth = minSide, sHeight = minSide;

    // Draw profile picture in a circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(profilePic, sx, sy, sWidth, sHeight, circleX - radius, circleY - radius, radius * 2, radius * 2);
    ctx.restore();

    let badgename = type === 'crew' && crewname ? crewname : company || 'Unknown';

    // Split text into two lines if too long
    const maxWidth = width * 0.8; // 80% of canvas width
    ctx.font = 'bold 70px DejaVuSans';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';

    const words = badgename.split(' ');
    let line1 = '', line2 = '';

    for (const word of words) {
      const testLine = line1 ? `${line1} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth) {
        line2 = `${line2} ${word}`.trim();
      } else {
        line1 = testLine;
      }
    }

    // Draw name, breaking into two lines if needed
    if (line2) {
      ctx.fillText(line1, width / 2, 1020); // First line
      ctx.fillText(line2, width / 2, 1090); // Second line
    } else {
      ctx.fillText(line1, width / 2, 1050); // Single-line case
    }

    // Draw "VERIFIED" text
    ctx.font = 'bold 80px DejaVuSans';
    ctx.fillStyle = '#053736';
    ctx.fillText('VERIFIED', width / 2, 1210);

    // Load and draw verification icon
    const verificationIconURL = 'https://ideaafricabucket.s3.eu-north-1.amazonaws.com/NF+VERIFY_badge_icon.png';
    const verificationIcon = await loadImage(verificationIconURL);
    ctx.drawImage(verificationIcon, circleX + radius - 100, circleY - radius + 50, 110, 110);

    // Generate QR code
    const qrImageData = await QRCode.toDataURL(qrData);
    const qrImage = await loadImage(qrImageData);
    ctx.drawImage(qrImage, (width - 250) / 2, height - 220, 250, 250);

    // Convert canvas to buffer
    const buffer = canvas.toBuffer('image/png');

    // Upload to S3
    const fileName = `badges/${badgename.replace(/\s+/g, '_')}_${Date.now()}.png`;
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME || '',
      Key: fileName,
      Body: buffer,
      ContentType: 'image/png',
      ACL: 'private' as ObjectCannedACL,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    console.log(`https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`);
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

  } catch (error) {
    console.error('Error generating badge:', error);
    throw new Error('Failed to generate badge');
  }
};

export const getContactSubmissions = async (req: Request, res: Response): Promise<Response> => {
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
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Extract page and limit from query, provide default values
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const totalSubmissions = await ContactFormSubmission.countDocuments();

    // Fetch paginated submissions
    const submissions = await ContactFormSubmission.find()
      .sort({ submittedAt: -1 }) 
      .skip(skip)
      .limit(limit);

    // Truncate each message field (e.g., to 100 characters max)
    const truncatedSubmissions = submissions.map((submission) => ({
      ...submission.toObject(),
      message: submission.message.length > 25
        ? `${submission.message.slice(0, 25)}...`
        : submission.message,
    }));

    return res.status(200).json({
      message: 'Contact submissions fetched successfully',
      currentPage: page,
      totalPages: Math.ceil(totalSubmissions / limit),
      totalSubmissions,
      submissions: truncatedSubmissions,
    });

  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    return res.status(500).json({
      message: 'Failed to fetch submissions',
      error: (error as Error).message,
    });
  }
};

export const getSingleContactSubmission = async (req: Request, res: Response): Promise<Response> => {
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

    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    const submission = await ContactFormSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    submission.read = true;
    await submission.save();

    return res.status(200).json({
      message: 'Contact submission fetched successfully',
      submission,
    });

  } catch (error) {
    console.error('Error fetching single contact submission:', error);
    return res.status(500).json({
      message: 'Failed to fetch submission',
      error: (error as Error).message,
    });
  }
};

export const replyToContactSubmission = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;
    const { subject, replyMessage } = req.body;

    if (!subject || !replyMessage) {
      return res.status(400).json({ message: 'Subject and reply message are required.' });
    }

    const submission = await ContactFormSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({ message: 'Contact form submission not found.' });
    }

    const fullName = `${submission.firstName} ${submission.lastName}`;
    const replyContent = `
      <!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Nollywood Filmmaker Database</title>
<style>
  body {
    font-family: Arial, sans-serif;
    background-color: #f4f4f4;
    margin: 0;
    padding: 20px;
    color: #333;
  }
  .container {
    max-width: 600px;
    background: #ffffff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    margin: auto;
  }
  .header img {
    width: 100%;
    max-width: 600px;
    border-radius: 8px;
  }
  h1 {
    color: #333;
  }
  p {
    font-size: 16px;
    line-height: 1.5;
  }
  .footer {
    margin-top: 20px;
    font-size: 14px;
    color: #777;
  }
</style>
</head>
<body>

<div class="container">
  <div class="header">
    <a href="https://nollywoodfilmmaker.com">
      <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
           alt="Nollywood Filmmaker Database">
    </a>
  </div>

  <h1>Hi ${fullName},</h1>

  <p>${replyMessage}</p>

  <p>Best Regards,<br/>Nollywood Filmmaker  Support Team</p>
</div>

</body>
</html>
    `;

    await sendEmail({
      to: submission.email,
      subject,
      text: replyMessage,
      html: replyContent,
    });

    return res.status(200).json({
      message: 'Reply sent successfully.',
      email: submission.email,
    });

  } catch (error) {
    console.error('Error replying to submission:', error);
    return res.status(500).json({
      message: 'Failed to send reply.',
      error: (error as Error).message,
    });
  }
};

//System Update to add missing nfscore field
export const updateMissingNfscore = async (req: Request, res: Response) => {
  try {
    // Update Crew where nfscore does not exist
    const crewResult = await Crew.updateMany(
      { nfscore: { $exists: false } },
      { $set: { nfscore: "0" } }
    );

    // Update Company where nfscore does not exist
    const companyResult = await Company.updateMany(
      { nfscore: { $exists: false } },
      { $set: { nfscore: "0" } }
    );

    return res.status(200).json({
      message: "nfscore field updated for Crew and Company",
      crewModified: crewResult.modifiedCount,
      companyModified: companyResult.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating nfscore fields:", error);
    return res.status(500).json({
      message: "Failed to update nfscore fields",
      error: error instanceof Error ? error.message : error,
    });
  }
};
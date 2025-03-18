import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Consultant, {IConsultant} from '../models/consultant';
import crypto from 'crypto';
import sendEmail from '../utils/sendEmail'; // Assumes you have a sendEmail function
import Availability from '../models/Availability';
import { Time } from '../types';
import AssignmentModel from '../models/Assignment';
import RequestModel from '../models/Request';
import AppointmentModel from '../models/Appointment';
import Transaction, {generateOrderId} from '../models/SetTransaction';
import mongoose from 'mongoose';
// import { fetchRequestByOrderId } from '../utils/UtilityFunctions';
import Preference, {IPreference} from '../models/PreferenceModel';
import ConsultantPreference, {IConsultPreference} from '../models/ConsultantPrefs';
import User from '../models/User';
import multerS3 from 'multer-s3';
import { S3Client, PutObjectCommand, GetObjectAclCommand} from '@aws-sdk/client-s3';
import multer from 'multer';
import Notification from '../models/Notification';
import Task from '../models/task'; // Ensure this path points to your Task model file
import { format, parseISO, add } from 'date-fns';
import moment from 'moment-timezone';
import { createAdminNotification, createNotification, credit, debit } from '../utils/UtilityFunctions';
import { getServicePriceByName, fetchUserEmailById, fetchExtensionPriceByLength, convertToGMTPlusOne} from '../utils/UtilityFunctions';
import { fetchConsultantEmail, fetchUserEmail } from './adminController';
import { uploads } from '../utils/UtilityFunctions';
import Resolve from '../models/Resolve';
import MusingModel from '../models/Musing';
import { userInfo } from 'os';
import WeeklySchedule from '../models/Availability';
import Wallet, { IWallet } from '../models/Wallet';
import WalletHistory from '../models/walletHistoryModel';
import Company from '../models/Company';
import Crew from '../models/Crew';
import Bank from '../models/Bank';
import task from '../models/task';
import ChatSettingsModel from '../models/chatSettingsModel';
import ServiceChatThread from '../models/ServiceChatThread';
import ServiceChat from '../models/ServiceChat';


const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Configure multer to use multer-s3 as the storage engine
const storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME || '',
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    // Define a unique filename pattern for the uploaded files
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

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


// Create the multer upload function using the S3 storage configuration
export const upload = multer({ storage }).single('file');

function getDayOfWeek(date: Date | string): string {
  // Convert date string to Date object if necessary
  const dayDate = typeof date === 'string' ? new Date(date) : date;

  // Array of day names
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Get day of week index and return corresponding name
  const dayIndex = dayDate.getDay();
  return daysOfWeek[dayIndex];
}

// Register Consultant
export const registerConsult = async (req: Request, res: Response) => {
  const { fname, lname, phone, email, password, expertise} = req.body;
  
  try {
    // Check for duplicate email
    const existingConsult = await Consultant.findOne({ email });
    if (existingConsult) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newConsult = new Consultant({
      fname,
      lname,
      phone,
      email,
      password: hashedPassword,
      role: 'consultant',
      expertise
    });

    await newConsult.save();

    const accessToken = generateAccessToken(String(newConsult._id), newConsult.role);
    const refreshToken = generateRefreshToken(String(newConsult._id));

    const userInfo = {
      id: newConsult._id,
      email: newConsult.email,
      phone: newConsult.phone,
      fname: newConsult.fname,
      lname: newConsult.lname,
      role: newConsult.role,
      expertise: newConsult.expertise
    };

    // Send verification email (this step is optional based on your flow)
    // const verificationLink = `${process.env.BASE_URL}/api/consultants/verify/${verificationToken}`;
    // await sendEmail(email, 'Verify your email', `Click here to verify your email: ${verificationLink}`);

    res.status(201).json({ accessToken, refreshToken, user: userInfo, message: 'Please check your email to verify your account.' });
  } catch (error) {
    res.status(500).json({ message: 'Error registering consultant', error });
  }
};

// Login Consultant
export const loginConsult = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  try {
    const consult = await Consultant.findOne({ email });
    if (!consult || consult.role !== 'consultant') {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, consult.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const accessToken = generateAccessToken(String(consult._id), consult.role);
    const refreshToken = generateRefreshToken(String(consult._id));

    const userInfo = {
      id: consult._id,
      fname: consult.fname,
      lname: consult.lname,
      phone: consult.phone,
      email: consult.email,
      role: consult.role,
      expertise: consult.expertise,
      profilepics: consult.profilepics
    };

    const wallet = await createWalletIfNotExists(String(consult._id));
    console.log('Wallet ensured:', wallet);

    res.json({ accessToken, refreshToken, user: userInfo });
    console.log(userInfo);
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
};

// Refresh Token for Consultant
export const refreshConsultantToken = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  const refreshToken = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as { userId: string };
    const accessToken = generateAccessToken(decoded.userId, 'consultant');

    res.json({ accessToken });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const createAvailability = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token missing" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as { userId: string; role: string };

    // Ensure the user is a consultant
    if (decoded.role !== "consultant") {
      return res.status(403).json({ message: "Access denied: Consultants only" });
    }

    const { schedule } = req.body;
    const userId = decoded.userId;

    if (!Array.isArray(schedule)) {
      return res.status(400).json({ message: "Invalid input: Schedule should be an array" });
    }

    const updatedResults: { day: string; action: string }[] = [];

    for (const entry of schedule) {
      const { day, slots, expertise, status } = entry;

      if (
        !["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(day) ||
        !Array.isArray(slots) ||
        !slots.every((slot) => typeof slot === "string" && /^\d{2}:\d{2}$/.test(slot)) ||
        !Array.isArray(expertise) ||
        !expertise.every((exp) => typeof exp === "string" && exp.trim().length > 0) ||
        !["open", "closed"].includes(status)
      ) {
        return res.status(400).json({ message: "Invalid input: Check day, slots, expertise, or status format" });
      }

      // Find the weekly schedule for the user
      const weeklySchedule = await WeeklySchedule.findOne({ userId });

      if (weeklySchedule) {
        // Check if a slot for the specified day exists
        const daySlot = weeklySchedule.schedule.find((slot) => slot.day === day);

        if (daySlot) {
          // Update existing slot
          daySlot.slots = slots;
          daySlot.expertise = expertise;
          daySlot.status = status;
          updatedResults.push({ day, action: "updated" });
        } else {
          // Add a new slot for the day
          weeklySchedule.schedule.push({ cid: userId, day, slots, expertise, status });
          updatedResults.push({ day, action: "added" });
        }

        await weeklySchedule.save();
      } else {
        // Create a new weekly schedule
        const newWeeklySchedule = new WeeklySchedule({
          userId,
          schedule: [{ cid: userId, day, slots, expertise, status }],
        });
        await newWeeklySchedule.save();
        updatedResults.push({ day, action: "created" });
      }
    }

    return res.status(200).json({
      message: "Availability schedule processed successfully",
      results: updatedResults,
    });
  } catch (error) {
    console.error("Error processing availability schedule:", error);
    return res.status(500).json({ message: "Error processing availability schedule", error });
  }
};

  export const fetchPendingAssignmentsByUserId = async (req: Request, res: Response): Promise<Response> => {
    const { uid } = req.params; // Get uid from the URL params
  
    try {
      // Find assignments with the specified uid and a status of 'pending'
      const assignments = await AssignmentModel.find({ cid: uid, status: 'pending' });
  
      if (assignments.length === 0) {
        return res.status(200).json({
          message: 'No pending assignments found for this user.',
          assignments: [],
        });
      }
  
      // Fetch user info and corresponding requests for each assignment
      const assignmentsWithDetails = await Promise.all(
        assignments.map(async (assignment) => {
          const user = await User.findById(assignment.uid).select('email profilepics fname lname');
          const request = await RequestModel.findOne({ orderId: assignment.orderId }).select('chat_title nameofservice stattusof createdAt');
  
          return {
            assignment,
            info: {
              chat_title: request ? request.chat_title : null,
              nameofservice : request ? request.nameofservice : null,
              status: request ? request.stattusof : null,
              created: request ? request.createdAt : null,
            },
            user: user
              ? {
                  email: user.email,
                  profilepics: user.profilepics,
                  fullname: `${user.fname} ${user.lname}`,
                }
              : null
          };
        })
      );
  
      return res.status(200).json({
        message: 'Pending assignments fetched successfully',
        assignments: assignmentsWithDetails,
      });
    } catch (error) {
      console.error('Error fetching pending assignments:', error);
      return res.status(500).json({ message: 'Failed to fetch pending assignments', error });
    }
  };
  
    

export const acceptAssignment = async (req: Request, res: Response): Promise<Response> => {
  const { uid, assignmentId } = req.params; // Extract uid and assignmentId from URL params

  try {
    // Find the assignment by id and ensure the uid matches
    const assignment = await AssignmentModel.findOne({ _id: assignmentId, cid: uid });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or user not authorized.' });
    }

    // Update assignment status to 'completed'
    assignment.status = 'completed';
    await assignment.save();

    // Find and update the related request where orderId matches assignment's orderId
    const updatedRequest = await RequestModel.findOneAndUpdate(
      { orderId: assignment.orderId },
      { stattusof: 'ongoing' }, // Update status of the request to 'ongoing'
      { new: true } // Return the updated document
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: 'Related request not found.' });
    }

    // Create a new appointment with the provided date and time
    const newAppointment = new AppointmentModel({
      date: new Date(updatedRequest.date), // Ensure date is passed in the correct format
      time: {
        hours: updatedRequest.time?.hours,
        minutes: updatedRequest.time?.minutes,
        seconds: updatedRequest.time?.seconds,
      },
      uid: updatedRequest.userId,
      cid: assignment.cid,
      orderId: assignment.orderId,
      expertise: updatedRequest.expertise
    });

    await newAppointment.save();

    return res.status(200).json({
      message: 'Assignment accepted, related request updated, and appointment created successfully.',
      assignment,
      updatedRequest,
      appointment: newAppointment,
    });
  } catch (error) {
    console.error('Error accepting assignment:', error);
    return res.status(500).json({ message: 'Failed to accept assignment and create appointment', error });
  }
};

export const declineAssignment = async (req: Request, res: Response): Promise<Response> => {
  const { uid, assignmentId } = req.params; // Extract uid and assignmentId from URL params

  try {
    // Find the assignment by id and ensure the uid matches
    const assignment = await AssignmentModel.findOne({ _id: assignmentId, cid: uid });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or user not authorized.' });
    }

    // Update assignment status to 'completed'
    assignment.status = 'pending';
    await assignment.save();

    // fetchRequestByOrderId(assignment.orderId);

    return res.status(200).json({ message: 'Request Declined' });

  } catch (error) {
    console.error('Error accepting assignment:', error);
    return res.status(500).json({ message: 'Failed to accept assignment and create appointment', error });
  }
};

export const fetchTransactionAndRequestByOrderId = async (req: Request, res: Response): Promise<Response> => {
  const { orderId } = req.params; // Extract orderId from URL params

  try {
    // Fetch transaction based on orderId
    const transaction = await Transaction.findOne({ orderId });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found for the given orderId.' });
    }

    // Fetch request based on orderId
    const request = await RequestModel.findOne({ orderId });
    if (!request) {
      return res.status(404).json({ message: 'Request not found for the given orderId.' });
    }

    // Fetch user based on uid from the request
    const user = await User.findById(request.userId).select('fname lname email');
    const email = user?.email;
    const fullName = user ? `${user.fname} ${user.lname}` : null;

    // Return both transaction, request, and user's full name in the response
    return res.status(200).json({
      message: 'Transaction, request, and user information fetched successfully.',
      transaction,
      request,
      user: {
        fullName,
        email,
      },
    });
  } catch (error) {
    console.error('Error fetching transaction, request, or user:', error);
    return res.status(500).json({
      message: 'Failed to fetch transaction, request, or user information',
      error,
    });
  }
};


// Function to retrieve preferences by userId
export const getPreferencesByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Find the preferences based on userId
    const preferences: IPreference | null = await Preference.findOne({ userId });

    if (!preferences) {
      // Return a default response if preferences are not set
      return res.status(404).json({
        message: 'Preferences not found for this user.',
        defaultPreferences: {
          newRequestOrder: 'off',
          updateOnMyOrders: 'off',
          recommendation: 'off',
          currency: 'NGN',
          timezone: 'GMT+1',
        },
      });
    }

    res.status(200).json({ preferences });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ message: 'Error retrieving preferences' });
  }
};


export const getAppointmentsByConsultantId = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params;

  try {
    // Fetch all appointments for the given consultant ID
    const appointments = await AppointmentModel.find({ cid });

    // Check if any appointments were found
    if (!appointments.length) {
      return res.status(200).json({ message: 'No appointments found for this consultant' });
    }

    // Enhance appointments with additional data from Request and User models
    const enhancedAppointments = await Promise.all(
      appointments.map(async (appointment) => {
        const relatedRequest = await RequestModel.findOne({ orderId: appointment.orderId });

        // Fetch user information based on `uid`, excluding sensitive fields
        const userInfo = await User.findById(appointment.uid).select(
          '-password -verificationToken -isVerified'
        );

        return {
          ...appointment.toObject(),
          chat_title: relatedRequest?.chat_title || null,
          nameofservice: relatedRequest?.nameofservice || null,
          booktime: relatedRequest?.booktime || null,
          roomId: relatedRequest?.orderId,
          user: userInfo || null, // Include user info or null if not found
        };
      })
    );

    // Return the enhanced appointments
    return res.status(200).json({
      message: 'Appointments fetched successfully',
      appointments: enhancedAppointments,
    });
  } catch (error) {
    console.error('Error fetching appointments by consultant ID:', error);
    return res.status(500).json({ message: 'Failed to fetch appointments', error });
  }
};


export const getAvailabilityByCid = async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;

    // Validate the `cid`
    if (!cid) {
      return res.status(400).json({ message: "Consultant ID (cid) is required." });
    }

    // Find all weekly schedule entries for the given `cid`
    const schedules = await WeeklySchedule.find({ "schedule.cid": cid });

    // If no schedules are found, return a 404 response
    if (!schedules || schedules.length === 0) {
      return res.status(404).json({ message: "No availability found for this consultant." });
    }

    // Extract and aggregate the consultant's schedule
    const availability = schedules.map((schedule) => {
      return schedule.schedule.filter((slot) => String(slot.cid) === cid);
    }).flat();

    // If no individual availability slots are found, return a 404 response
    if (availability.length === 0) {
      return res.status(404).json({ message: "No availability found for this consultant." });
    }

    // Return the found availability entries
    res.status(200).json({ availability });
  } catch (error) {
    console.error("Error fetching availability:", error);
    res.status(500).json({ message: "Error retrieving availability data", error });
  }
};


export async function fetchConsultantById(req: Request, res: Response): Promise<void> {
  const consultantId = req.params.id;

  try {
    // Check if the ID is a valid MongoDB ObjectID
    if (!mongoose.Types.ObjectId.isValid(consultantId)) {
      res.status(400).json({ message: 'Invalid consultant ID format' });
      return;
    }

    // Fetch the consultant by ID
    const consultant: IConsultant | null = await Consultant.findById(consultantId).exec();

    if (consultant) {
      res.status(200).json(consultant);
    } else {
      res.status(404).json({ message: 'Consultant not found' });
    }
  } catch (error) {
    const errorMessage = (error as Error).message || 'Error retrieving consultant';
    console.error(`Error fetching consultant by ID: ${errorMessage}`);
    res.status(500).json({ message: errorMessage });
  }
}

// Helper function to validate the time object
function isValidTime(time: Time): boolean {
  return (
    typeof time.hours === 'number' &&
    typeof time.minutes === 'number' &&
    typeof time.seconds === 'number' &&
    time.hours >= 0 && time.hours < 24 &&
    time.minutes >= 0 && time.minutes < 60 &&
    time.seconds >= 0 && time.seconds < 60
  );
}

export const updateConsultantById = async (req: Request, res: Response): Promise<void> => {
  const consultantIdFromParams = req.params.id;

  // Check if the ID in the params matches the ID from the token
  if (consultantIdFromParams !== req.consultantId) {
    res.status(403).json({ message: 'Access denied. You are not authorized to update this consultant.' });
    return;
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(consultantIdFromParams)) {
      res.status(400).json({ message: 'Invalid consultant ID format' });
      return;
    }

    const updateFields = req.body;

    const updatedConsultant = await Consultant.findByIdAndUpdate(
      consultantIdFromParams,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (updatedConsultant) {
      res.status(200).json(updatedConsultant.profilepics);
    } else {
      res.status(404).json({ message: 'Consultant not found' });
    }
  } catch (error) {
    const errorMessage = (error as Error).message || 'Error updating consultant';
    console.error(`Error updating consultant by ID: ${errorMessage}`);
    res.status(500).json({ message: errorMessage });
  }
};

export const fetchConsultantProfilePicById = async (req: Request, res: Response): Promise<void> => {
  const consultantId = req.params.id;

  try {
    // Validate the consultant ID format
    if (!mongoose.Types.ObjectId.isValid(consultantId)) {
      res.status(400).json({ message: 'Invalid consultant ID format' });
      return;
    }

    // Fetch only the profilepics field of the consultant
    const consultant = await Consultant.findById(consultantId, 'profilepics').exec();

    if (consultant) {
      res.status(200).json({ profilepics: consultant.profilepics });
    } else {
      res.status(404).json({ message: 'Consultant not found' });
    }
  } catch (error) {
    const errorMessage = (error as Error).message || 'Error retrieving profile picture';
    console.error(`Error fetching consultant profile picture by ID: ${errorMessage}`);
    res.status(500).json({ message: errorMessage });
  }
};

export const updateConsultantProfilePic = async (req: Request, res: Response): Promise<Response> => {
  const consultantIdFromParams = req.params.id;

  // Check if the ID in the params matches the ID from the token
  if (consultantIdFromParams !== req.consultantId) {
    return res.status(403).json({ message: 'Access denied. You are not authorized to update this consultant.' });
  }

  try {
    const consultantId = consultantIdFromParams;

    // Validate the consultant ID
    if (!mongoose.Types.ObjectId.isValid(consultantId)) {
      return res.status(400).json({ message: 'Invalid consultant ID format' });
    }

    // Check if a file has been uploaded
    const file = req.file as Express.MulterS3.File | undefined;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' }); // Inform the user if no file is uploaded
    }

    // S3 file URL from multer-s3 upload
    const fileUrl = file.location; // S3 URL is available in the 'location' property

    // Update the consultant's profilepics field
    const updatedConsultant = await Consultant.findByIdAndUpdate(
      consultantId,
      { $set: { profilepics: fileUrl } }, // Use $set to update the profilepics field
      { new: true, runValidators: true }
    );

    if (!updatedConsultant) {
      return res.status(404).json({ message: `Consultant with ID ${consultantId} not found` });
    }

    return res.status(200).json({
      message: 'Profile picture updated successfully',
      profilepics: updatedConsultant.profilepics,
    });
  } catch (error) {
    console.error('Error updating consultant profile picture:', error);
    return res.status(500).json({ message: 'Failed to update consultant profile picture', error });
  }
};

export const getActiveRequest = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Consultant ID
  const { page = 1, limit = 10, sort = 'desc' } = req.query;

  try {
    // Parse page and limit to integers
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;

    // Fetch all appointments for the given consultant ID with pagination and sorting
    const appointments = await AppointmentModel.find({ cid: id })
      .sort({ creationDate: sort === 'asc' ? 1 : -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    if (!appointments.length) {
      return res.status(200).json({ message: 'No appointments found for this consultant' });
    }

    // Fetch requests and user details for each appointment
    const appointmentsWithDetails = await Promise.all(
      appointments.map(async (appointment) => {
        const request = await RequestModel.findOne({
          orderId: appointment.orderId,
          stattusof: { $nin: ['pending', 'completed'] }, // Exclude 'pending' and 'completed'
        });

        if (request) {
          // Fetch user details by userId, excluding the password
          const user = await User.findById(request.userId).select('-password -isVerified -verificationToken -createdAt -updatedAt -expertise');

          if (user) {
            return {
              ...appointment.toObject(),
              request: request.toObject(),
              user: user.toObject(), // Include user details
            };
          }
        }

        return null; // Exclude appointments without valid requests or users
      })
    );

    // Filter out null values
    const validAppointments = appointmentsWithDetails.filter((appointment) => appointment !== null);

    if (!validAppointments.length) {
      return res.status(200).json({ message: 'No valid appointments found for this consultant' });
    }

    // Return the list of appointments with valid requests and user details
    return res.status(200).json({
      message: 'Appointments with valid requests and user details fetched successfully',
      page: pageNumber,
      limit: limitNumber,
      total: validAppointments.length,
      appointments: validAppointments,
    });
  } catch (error) {
    console.error('Error fetching active requests:', error);
    return res.status(500).json({ message: 'Failed to fetch active requests', error });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  // Check if the Authorization header exists and starts with 'Bearer '
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  const refreshToken = authHeader.split(' ')[1]; // Get the token from the header

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as { userId: string };

    // Generate a new access token
    const accessToken = generateAccessToken(decoded.userId, 'consultant'); // Or fetch role from DB if needed

    res.json({ accessToken });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const updateConsultantPassword = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from URL params
  const { currentPassword, newPassword } = req.body; // Extract currentPassword and newPassword from the request body

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the user by userId
    const consultant = await Consultant.findById(userId);
    if (!consultant) {
      return res.status(404).json({ message: `User with ID ${userId} not found` });
    }

    // Compare current password with stored password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, consultant.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Ensure the new password is different from the current password
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password cannot be the same as the current password' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password field only
    const updatedUser = await Consultant.findByIdAndUpdate(
      userId,
      { password: hashedPassword },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: `Consultant with ID ${userId} not found` });
    }

    return res.status(200).json({
      message: 'Successfully updated password',
      status: 'completed',
    });

  } catch (error) {
    console.error('Error updating user password:', error);
    return res.status(500).json({ message: 'Failed to update user password', error });
  }
};


export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Find user by email
    const consultant = await Consultant.findOne({ email });
    if (!consultant) {
      return res.status(404).json({ message: 'User with this email does not exist.' });
    }

    // Generate a unique token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Store a hashed version of the token in the user's document for verification
    consultant.verificationToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    await consultant.save();

    // Generate the password reset URL
    // https://nollywoodfilmmaker.com/consultants/auth/reset-password?token=6d95fb377a0c14d1891052e383ae78f1c3e4e5c7784a7e37bd7f4f96fee28411
    const resetUrl = `https://nollywoodfilmmaker.com/consultants/auth/reset-password?token=${resetToken}`;
    console.log(resetUrl);
    
    await sendEmail({
      to: consultant.email,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Click the following link to reset your password: ${resetUrl}. If you did not request this, please ignore this email.`,
      html: `<p>You requested a password reset.</p>
             <p>Click the following link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>
             <p>If you did not request this, please ignore this email.</p>`,
    });    
    res.status(200).json({ message: 'Password reset link has been sent to your email.' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ message: 'Server error, please try again later.' });
  }
};


export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    // Check if token is provided
    if (!token) {
      return res.status(400).json({ message: 'Token is required.' });
    }

    // Hash the token and find the user
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const consultant = await Consultant.findOne({
      verificationToken: hashedToken,
    });

    if (!consultant) {
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }

    // Update user's password and clear the token
    consultant.password = await bcrypt.hash(newPassword, 10); // Ensure this is hashed as needed
    consultant.verificationToken = undefined;
    await consultant.save();

    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Server error, please try again later.' });
  }
};

export const fetchConsultantPref = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from URL params

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the user's preferences by userId
    const preferences = await ConsultantPreference.findOne({ userId });

    if (!preferences) {
      return res.status(404).json({ message: `Preferences not found for user ID ${userId}` });
    }

    return res.status(200).json({ preferences });

  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return res.status(500).json({ message: 'Failed to fetch user preferences', error });
  }
};

export const updateConsultantPreference = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from the URL params
  const { iupdateOrder, newOrder, recommendation, timezone } = req.body; // Extract the preference data from the request body

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the existing preference document for the user
    const preference = await ConsultantPreference.findOne({ userId });

    if (!preference) {
      // If no preference document exists, create a new one with the provided data
      const newPreference = new ConsultantPreference({
        userId,
        iupdateOrder,
        newOrder,
        recommendation,
        timezone,
      });

      await newPreference.save();

      return res.status(201).json({ message: 'Preference created successfully', preference: newPreference });
    }

    // If the preference document exists, update it with the new values
    preference.iupdateOrder = iupdateOrder ?? preference.iupdateOrder;
    preference.newOrder = newOrder ?? preference.newOrder;
    preference.recommendation = recommendation ?? preference.recommendation;
    preference.timezone = timezone ?? preference.timezone;

    const updatedPreference = await preference.save();

    return res.status(200).json({ message: 'Preference updated successfully', preference: updatedPreference });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    return res.status(500).json({ message: 'Failed to update user preferences', error });
  }
};

export const fetchAssignmentsAndRequests = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params;
  const { search } = req.query; // Capture search query

  try {
    // Validate consultant ID (cid)
    if (!cid || !mongoose.Types.ObjectId.isValid(cid)) {
      return res.status(400).json({ message: 'Invalid consultant ID (cid)' });
    }

    // Fetch assignments (appointments) for the given consultant ID
    const assignments = await AppointmentModel.find({ cid }, 'orderId');

    // Extract order IDs from the fetched assignments
    const orderIds = assignments.map((assignment) => assignment.orderId);

    if (orderIds.length === 0) {
      return res.status(404).json({ requests: [] }); // No assignments found
    }

    // Build request filter
    const requestFilter: any = {
      orderId: { $in: orderIds }, // Match order IDs
      type: 'Chat',
      stattusof: { $in: ['ongoing', 'ready', 'completed'] }, // Valid statuses
    };

    // Apply search filter if `search` is provided
    if (search) {
      requestFilter.chat_title = { $regex: new RegExp(search as string, 'i') }; // Case-insensitive search
    }

    // Fetch and sort requests by `booktime` (newest first)
    const requests = await RequestModel.find(
      requestFilter,
      'chat_title stattusof time orderId nameofservice date createdAt booktime endTime' // Fields to return
    ).sort({ booktime: -1 });

    // Process and format each request to include `startTime`
    const processedRequests = requests.map((request) => {
      const { booktime } = request.toObject(); // Convert request to plain object
      let startTime: string | null = null;

      if (booktime) {
        // Format `booktime` for GMT+1 timezone
        const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
        startTime = moment(booktime).utcOffset('+01:00').format(gmtPlusOneFormat);
      }

      return {
        ...request.toObject(),
        cid, // Add consultant ID
        startTime, // Add formatted start time
      };
    });

    // Respond with sorted and processed requests
    return res.status(200).json({ requests: processedRequests });
  } catch (error) {
    console.error('Error fetching assignments and requests:', error);
    return res.status(500).json({
      message: 'Failed to fetch assignments and requests',
      error,
    });
  }
};



export const fetchHistoryByCid = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params;
  const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10

  try {
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

    // Fetch appointments with the given cid
    const appointments = await AppointmentModel.find({ cid }, 'orderId');

    // Extract orderIds from the appointments
    const orderIds = appointments.map((appointment) => appointment.orderId);

    // Fetch paginated completed requests
    const completedRequests = await RequestModel.find(
      {
        orderId: { $in: orderIds }, // Match the orderIds
        stattusof: 'completed',    // Status must be completed
      },
      'movie_title chat_title stattusof time userId orderId nameofservice date createdAt updatedAt' // Select specific fields
    )
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .sort({ updatedAt: -1 }) // Sort by most recent updatedAt;

    // Count total documents for pagination info
    const totalCount = await RequestModel.countDocuments({
      orderId: { $in: orderIds },
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

export const fetchPendingRequestsByConsultantExpertise = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params; // Consultant ID from request parameters

  try {
    // Validate consultant ID
    if (!mongoose.Types.ObjectId.isValid(cid)) {
      return res.status(400).json({ message: 'Invalid consultant ID' });
    }

    // Fetch the consultant's expertise
    const consultant = await Consultant.findById(cid, 'expertise');
    if (!consultant) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    const { expertise } = consultant;

    // Validate expertise
    if (!expertise || expertise.length === 0) {
      return res.status(404).json({ message: 'Consultant has no expertise defined' });
    }

    // Fetch requests where expertise matches at least one of the consultant's expertise,
    // type is 'request', and stattusof is 'pending'
    const matchingRequests = await RequestModel.find(
      {
        expertise: { $in: expertise }, // Match any expertise in the consultant's expertise array
        type: 'request', // Only include requests of type 'request'
        stattusof: 'pending', // Only include requests with status 'pending'
      },
      'chat_title type stattusof orderId nameofservice date createdAt expertise' // Fields to return
    );

    return res.status(200).json({ requests: matchingRequests });
  } catch (error) {
    console.error('Error fetching requests by consultant expertise:', error);
    return res.status(500).json({
      message: 'Failed to fetch requests by consultant expertise',
      error,
    });
  }
};

export const completeRequest = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Extract the Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    // Verify the token
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const { role } = decodedToken as { role: string };
    const { userId } = decodedToken as { userId: string };
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }

    // Extract orderId from request body
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ message: 'Missing orderId in the request body' });
    }

    // Find and update the request
    const updatedRequest = await RequestModel.findOneAndUpdate(
      { orderId }, // Match the request by orderId
      { $set: { stattusof: 'completed' } }, // Set `stattusof` to "completed"
      { new: true } // Return the updated document
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: `Request with orderId ${orderId} not found` });
    }

    const transaction = await Transaction.findOne({ orderId }).exec();
    
    if (!transaction) {
      return res.status(404).json({ message: `Transaction with orderId ${orderId} not found` });
    }

      const price = transaction.price;

      const actualIncome = parseFloat(price) * 0.6;
          // Here you would perform the credit or debit operation (credit/cid, price or amount depending on your logic)
      credit(userId, actualIncome, orderId); // Example: assuming 'credit' needs `cid` and `price`

      const request = await RequestModel.findOne({ orderId: orderId });

      if (!request) {
        throw new Error("Request not found");
      }

      const user = await User.findById(request.userId);

      if (!user) {
        throw new Error("User not found");
      }

        await sendEmail({
          to: user.email,
          subject: "Chat Completed",
          text: `Thanks ${user.fname} ${user.lname} for using our chat service.

        Here are some of our other services:
        - Service 1: https://example.com/service1
        - Service 2: https://example.com/service2
        - Service 3: https://example.com/service3
        `,
          html: `<p>Thanks <strong> ${user.fname} ${user.lname}</strong> for using our chat service.</p>
                <p>Here are some of our other services:</p>
                <ul>
                  <li><a href="https://example.com/service1">Service 1</a></li>
                  <li><a href="https://example.com/service2">Service 2</a></li>
                  <li><a href="https://example.com/service3">Service 3</a></li>
                </ul>`,
        });


    return res.status(200).json({
      message: 'Request updated to completed successfully',
      request: updatedRequest,
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    return res.status(500).json({ message: 'Failed to update request status', error });
  }
};

export const fetchNotifications = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from request parameters
  const { page = 1, limit = 10, isRead } = req.query; // Extract query parameters with defaults
  const token = req.headers.authorization?.split(' ')[1]; // Extract Bearer token

  if (!token) {
    return res.status(403).json({ message: 'Access denied. No token provided.' });
  }

  try {
    // Verify token and extract payload
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as { userId: string; role: string };

    // Validate role and userId
    if (decoded.role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Only consultants are allowed.' });
    }

    if (decoded.userId !== userId) {
      return res.status(403).json({ message: 'Access denied. User ID mismatch.' });
    }

    // Parse pagination values
    const pageNumber = Math.max(Number(page), 1); // Ensure page number is at least 1
    const pageSize = Math.max(Number(limit), 1); // Ensure limit is at least 1

    // Build the query filter
    const filter: Record<string, any> = { userId };
    if (isRead !== undefined) {
      filter.isRead = isRead === 'true'; // Convert string to boolean
    }

    // Fetch notifications with pagination
    const totalDocuments = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 }) // Sort by creation date in descending order
      .skip((pageNumber - 1) * pageSize) // Skip documents for previous pages
      .limit(pageSize); // Limit to the specified number of items per page

    // Return response
    return res.status(200).json({
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalDocuments / pageSize),
        totalDocuments,
      },
      notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    if (error === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    return res.status(500).json({ message: 'Failed to fetch notifications.', error });
  }
};

export const getTasksByConsultant = async (req: Request, res: Response): Promise<Response> => {
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

    // Extract role and userId from token
    const { role, userId } = decodedToken as { role: string; userId: string };

    // Ensure the role is 'consultant'
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }

    // Ensure the userId matches the cid parameter
    const { cid } = req.params;
    if (userId !== cid) {
      return res.status(403).json({ message: 'Access denied. User ID does not match consultant ID.' });
    }

    // Fetch tasks associated with the given cid
    const tasks = await Task.find({ cid, status: 'pending' });

    if (!tasks.length) {
      return res.status(404).json({ message: 'No tasks found for the specified consultant.' });
    }

    // Enhance tasks with movie_title and user info
    const enhancedTasks = await Promise.all(
      tasks.map(async (task) => {
        const relatedRequest = await RequestModel.findOne({ orderId: task.orderId }).select('movie_title');
        const relatedUser = await User.findById(task.uid).select('-password -verificationToken -isVerified');

        return {
          ...task.toObject(),
          movie_title: relatedRequest?.movie_title || null,
          user_info: relatedUser || null,
        };
      })
    );

    return res.status(200).json({
      message: 'Tasks fetched successfully',
      tasks: enhancedTasks,
    });
  } catch (error) {
    console.error('Error fetching tasks for consultant:', error);
    return res.status(500).json({ message: 'Failed to fetch tasks', error });
  }
};


function getTimeFromDate(date: Date) {
  const targetDate = moment(date).tz('Africa/Lagos'); // Change timezone to Lagos
  const hours = targetDate.hour();
  const minutes = targetDate.minute();
  const seconds = targetDate.second();

  return { hours, minutes, seconds };
}

async function chatTransaction(
  title: string,
  userId: string,
  type: string,
  chat_title: string,
  date: string, // ISO 8601 date string
  time: string, // JavaScript Date object
  summary: string,
  consultant: string,
  originalOrderId: string,
  cid: string,
): Promise<{ transaction: any; request: any }> { // Allow undefined in return type if necessary
  try {
    // Fetch service price and user email
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    // Process time
    const result = getTimeFromDate(new Date(time));

    const booktime = {
      hours: result.hours,
      minutes: result.minutes,
      seconds: result.seconds,
    };

    // Handle index validation and removal
    try {
      const indexes = await Transaction.collection.indexes();
      const indexExists = indexes.some((index) => index.name === 'reference_1');
      if (indexExists) {
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }

    // Create new transaction
    const newTransaction = new Transaction({
      title,
      userId,
      type,
      orderId: generateOrderId(),
      price,
      reference: '',
      status: 'completed',
      originalOrderId: originalOrderId,
    });
    await newTransaction.save();

    let endTime: string | null = null;

    const dayofWeek = getDayOfWeek(date);

    const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
    const endDateTime = add(new Date(time), { hours: 1 });
    endTime = moment(endDateTime).utcOffset('+01:00').format(gmtPlusOneFormat);


    // Create new request
    const newRequest = new RequestModel({
      chat_title,
      stattusof: 'awaiting',
      type,
      date,
      time: booktime,
      booktime: time,
      summary,
      consultant,
      nameofservice: title,
      orderId: newTransaction.orderId, 
      userId,
      expertise: consultant,
      day: dayofWeek,
      endTime: endTime,
      cid: cid,
    });
    await newRequest.save();

    // Create the new appointment
    // const newAppointment = new AppointmentModel({
    //   date,
    //   time: booktime,
    //   uid: userId,
    //   cid,
    //   orderId: newTransaction.orderId,
    //   expertise: consultant,
    // });

    // // Save the appointment to the database
    // const savedAppointment = await newAppointment.save();

    if (newRequest) {
      const updatedRequest = await RequestModel.findOneAndUpdate(
        { orderId: originalOrderId }, // Match the orderId
        { stattusof: 'completed' }, // Update the stattusof field to "ready"
        { new: true } // Return the updated document
      );

      if (updatedRequest) {
        await Task.findOneAndUpdate(
          { orderId: originalOrderId }, // Match the orderId
          { status: 'completed' }, // Update the stattusof field to "completed"
          { new: true } // Return the updated document
        );
      }
    }

    // Consultant Notification Created
    createNotification(cid.toString(), userId.toString(), 'consultant', 'Chat', newTransaction.orderId.toString(), 'New Order', 'You have a New Order Match');
    // User Notification Created
    createNotification(userId.toString(), cid.toString(), 'user', 'Chat', newTransaction.orderId.toString(), 'Set Your Chat Date', 'An Email Has Been Sent to you with Link to Set or Accept New Chat Date');

    const email = await fetchConsultantEmail(cid);
    const useremail = await fetchUserEmail(userId);

    // const dated = newRequest.date.split('T')[0];
    const dated = new Date(newRequest.date).toISOString().split('T')[0];
    const timed = `${newRequest.time?.hours}:${newRequest.time?.minutes}`;

    console.log('My Date', dated);
    console.log('My Time', timed);

    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: 'New Order',
          text: 'You have a new order.',
          html: `<p><strong>You have a new order.</strong></p>
                 <p>Please check your dashboard for more details.</p>`,
        });        
        console.log('Email sent successfully.');
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    } else {
      console.log('Consultant not found');
    }

    if (useremail) {
      try {
        await sendEmail({
          to: useremail,
          subject: 'New Chat Assigned',
          text: `Select your desired date and time to book a chat here: https://nollywoodfilmmaker.com/user/dashboard?orderId=${newTransaction.orderId}&cid=${newRequest.cid}&date=${dated}&time=${timed}`,
          html: `<p><strong>New Chat Assigned</strong></p>
                 <p>Select your desired date and time to book a chat:</p>
                 <p><a href="https://nollywoodfilmmaker.com/user/dashboard?orderId=${newTransaction.orderId}&cid=${newRequest.cid}&date=${dated}&time=${timed}" target="_blank">Click here to book your chat</a></p>`,
        });        
        console.log('Email sent successfully.');
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    } else {
      console.log('Consultant not found');
    }

    // Return both transaction and request data
    return {
      transaction: newTransaction,
      request: newRequest,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error in chatTransaction:', error.message);
      throw new Error(`Error creating transaction and request: ${error.message}`);
    } else {
      console.error('Unknown error in chatTransaction');
      throw new Error('An unknown error occurred while creating transaction and request.');
    }
  }
}


export const handleChatTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, chat_title, date, time, summary, consultant, originalOrderId, cid } = req.body;

  try {
    // Call the chatTransaction function with the request data
    const result = await chatTransaction(
      title,
      userId,
      type,
      chat_title,
      date,
      time, // Ensure `time` is converted to a Date object
      summary,
      consultant,
      originalOrderId,
      cid
    );

    // Send success response
    res.status(201).json({
      message: 'Transaction and request created successfully',
      transaction: result.transaction,
      request: result.request,
    });
  } catch (error) {
    // Handle errors
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};



export const uploadConsultantFiles = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Handle file upload with multer
    const files = await new Promise<Express.MulterS3.File[]>((resolve, reject) => {
      uploads(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          console.error('Multer Error:', err.message);
          return reject(new Error(`Multer error: ${err.message}`));
        } else if (err) {
          console.error('Upload Error:', err.message);
          return reject(new Error(`File upload failed: ${err.message}`));
        }

        if (!req.files || !(req.files instanceof Array)) {
          return reject(new Error('No files uploaded'));
        }

        resolve(req.files as Express.MulterS3.File[]);
      });
    });

    // Extract orderId from the request body
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }

    // Insert each file as a separate Resolve record
    const resolveRecords = files.map((file) => ({
      orderId,
      filename: file.originalname,
      filepath: file.location,
      size: file.size,
    }));

    // Save the records in bulk
    await Resolve.insertMany(resolveRecords);

    // Update the related request status to "ready"
    await RequestModel.findOneAndUpdate(
      { orderId }, // Match the orderId
      { stattusof: 'ready' }, // Update the stattusof field to "ready"
      { new: true } // Return the updated document
    );

    const tasks = await Task.find({ orderId: orderId }).exec();

    if (!tasks || tasks.length === 0) {
      return res.status(404).json({ message: "No task found for the given orderId" });
    }

// Assuming you expect only one task per orderId, take the first task
    const task = tasks[0];

    createNotification(task.uid.toString(), task.cid.toString(), 'user', 'Files', orderId.toString(), 'New Files', 'You Recieved New Files for Your Request Service');

    return res.status(200).json({
      message: 'Files uploaded and records created successfully',
      resolve: resolveRecords,
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    return res.status(500).json({
      message: 'Failed to upload files and create records',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const fetchResolveFiles = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { orderId } = req.params; // Extract orderId from the request parameters

    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }

    // Find all resolve records by orderId
    const resolveRecords = await Resolve.find({ orderId });

    if (resolveRecords.length === 0) {
      return res.status(404).json({ message: `No resolve records found for orderId ${orderId}` });
    }

    // Transform records into a more user-friendly format
    const files = resolveRecords.map((record) => ({
      filename: record.filename,
      filepath: record.filepath,
      size: record.size,
      createdAt: record.createdAt,
    }));

    return res.status(200).json({
      message: 'Resolve files fetched successfully',
      orderId,
      files,
    });
  } catch (error) {
    console.error('Error fetching resolve files:', error);
    return res.status(500).json({
      message: 'Failed to fetch resolve files',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const verifyEmailAndSetPassword = async (req: Request, res: Response): Promise<Response> => {
  const { token, password } = req.body;

  try {
    // Validate input for missing token or password
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required.' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required.' });
    }

    // Find consultant by verification token
    const consultant = await Consultant.findOne({ verificationToken: token });
    if (!consultant) {
      return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the consultant record
    consultant.password = hashedPassword;
    consultant.verificationToken = undefined; // Remove token after verification
    consultant.status = 'active';

    await consultant.save();

    return res.status(200).json({ message: 'Email verified and password set successfully.' });
  } catch (error) {
    console.error('Error verifying email and setting password:', error);
    return res.status(500).json({ message: 'Failed to verify email and set password.', error });
  }
};

export const createWalletIfNotExists = async (cid: string): Promise<IWallet> => {
  try {
    // Check if a wallet already exists for the given cid
    let wallet = await Wallet.findOne({ cid });

    // If it doesn't exist, create a new wallet
    if (!wallet) {
      wallet = new Wallet({
        cid,
        balance: 0,
        availableBalance: 0,
        status: 'verified',
      });

      await wallet.save();
    }

    // Return the existing or newly created wallet
    return wallet;
  } catch (error) {
    console.error('Error creating or retrieving wallet:', error);
    throw new Error('Failed to create or retrieve wallet');
  }
};

export async function getWalletByCid(req: Request, res: Response): Promise<Response> { 
  const { cid } = req.params; // Extracting cid from the URL parameter

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
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }

    // Fetch only the required fields from the Wallet collection
    const wallet = await Wallet.findOne({ cid }).select('balance cid _id availableBalance dateCreated status').exec();

    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    return res.status(200).json({
      _id: wallet._id,
      cid: wallet.cid,
      balance: wallet.balance / 100, // Convert balance to intended value
      availableBalance: wallet.availableBalance / 100, // Convert available balance to intended value
      dateCreated: wallet.dateCreated,
      status: wallet.status
    });
  } catch (error) {
    console.error('Error fetching wallet by cid:', error);
    return res.status(500).json({ message: 'Error fetching wallet' });
  }
}


export async function getWalletHistory(req: Request, res: Response): Promise<Response> {
  const { cid } = req.params; // Extracting cid from the URL parameter

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
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }

    // Finding wallet history documents by cid
    const history = await WalletHistory.find({ cid }).exec();

    if (!history || history.length === 0) {
      return res.status(404).json({ message: 'No wallet history found for this cid' });
    }

    return res.status(200).json(history);
  } catch (error) {
    console.error('Error fetching wallet history:', error);
    return res.status(500).json({ message: 'Error fetching wallet history' });
  }
}

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

    // Check Consultant Role
    const { role } = decodedToken as { role: string };
    if (role !== "consultant") {
      return res.status(403).json({ message: "Access denied. Consultant role required." });
    }

    const { type, name, sortBy, roles, location, typeFilter, department, fee } = req.query;
    const { page = 1, limit = 10 } = req.query;

    // Validate `type` parameter
    if (type !== "crew" && type !== "company") {
      return res.status(400).json({ message: "Invalid type. Use 'crew' or 'Company'." });
    }

    // Pagination parameters
    const pageNumber = Math.max(1, parseInt(page as string, 10));
    const pageSize = Math.max(1, parseInt(limit as string, 10));
    const skip = (pageNumber - 1) * pageSize;

    // Choose the appropriate model dynamically
    const Model = (type === "crew" ? Crew : Company) as mongoose.Model<any>;

    // Construct query filters
    const query: any = { verified: true }; // Ensure verified is true

     // Name filtering
    if (type === "crew" && name) {
      query.$or = [
        { firstName: { $regex: name as string, $options: "i" } },
        { lastName: { $regex: name as string, $options: "i" } },
      ];
    } else if (type === "company" && name) {
      query.name = { $regex: name as string, $options: "i" };
    }

    // Apply role filter for `crew`
    if (type === "crew" && roles) {
      query.role = { $in: (roles as string).split(",") };
    }

    // Apply department filter for `crew`
    if (type === "crew" && department) {
      query.department = { $regex: department as string, $options: "i" };
    }

    // Apply type filter for `consultant`
    if (type === "company" && typeFilter) {
      query.type = { $regex: typeFilter as string, $options: "i" };
    }

    // Apply location filter (expects "country,state")
    if (location) {
      const locationParts = (location as string).split(",");
      const country = locationParts[0]?.trim();
      const state = locationParts[1]?.trim();

      query["location.country"] = { $regex: country, $options: "i" };

      if (state) {
        query["location.state"] = { $regex: state, $options: "i" };
      }
    }

    // **Filter by exact `fee` string match**
    if (fee) {
      query.fee = fee as string;
    }

    // Define sorting conditions
    const sortOptions: Record<string, 1 | -1> = { createdAt: -1 }; // Default sorting by `createdAt`

    if (sortBy === "department" && type === "crew") {
      sortOptions.department = 1;
    } else if (sortBy === "type" && type === "company") {
      sortOptions.type = 1;
    }

    // Fetch paginated and sorted data
    const data = await Model.find(query).sort(sortOptions).skip(skip).limit(pageSize);

    // Count total records
    const totalRecords = await Model.countDocuments(query);

    // Return response
    return res.status(200).json({
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} data fetched successfully.`,
      data,
      pagination: {
        totalRecords,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalRecords / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({
      message: "Failed to fetch data",
      error: error,
    });
  }
};



export const createWithdrawal = async (req: Request, res: Response): Promise<Response> => {
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

    const { amount, bankname, accountnumber } = req.body;

    // Validate the input body
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "A valid amount is required and should be greater than 0" });
    }
    if (!bankname || !accountnumber) {
      return res.status(400).json({ message: "Bank name and account number are required for withdrawal" });
    }

    // Attempt to create a withdrawal
    const wallet: IWallet | null = await debit(userId, amount, bankname, accountnumber);

    if (!wallet) {
      return res.status(500).json({ message: "Failed to create withdrawal. Wallet not updated." });
    }

    createAdminNotification('Withdrawal', userId ,'New Withdrawal Request');

    return res.status(200).json({
      message: "Withdrawal created successfully. Pending approval.",
      wallet,
    });
  } catch (error) {
    console.error("Error creating withdrawal:", error);
    return res.status(500).json({ message: "Failed to create withdrawal", error });
  }
};

export const fetchWalletHistoryTotalsByCID = async (cid: string) => {
  try {
    // Validate the provided CID
    if (!cid) {
      throw new Error('CID is required to fetch wallet history totals.');
    }

    const currentYear = new Date().getFullYear();

    // Fetch total amount where type is 'deposit' for the specific CID
    const totalDeposits = await WalletHistory.aggregate([
      { $match: { type: 'deposit', cid } }, // Match both type and CID
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

    // Map results to include month numbers
    const monthlyDepositsFormatted = monthlyDepositTotals.map((monthData) => ({
      month: monthData._id, // Month number
      totalAmount: monthData.totalAmount,
    }));

    // Format the response totals with defaults to avoid undefined results
    const response = {
      totalDeposits: (totalDeposits[0]?.totalAmount/100) || 0,
      totalPendingWithdrawals: (totalPendingWithdrawals[0]?.totalAmount/100) || 0,
      totalCompletedWithdrawals: (totalCompletedWithdrawals[0]?.totalAmount/100) || 0,
      monthlyDeposits: monthlyDepositsFormatted,
    };

    return {
      success: true,
      message: 'Wallet history totals fetched successfully',
      cid,
      totals: response,
    };
  } catch (error) {
    console.error('Error fetching wallet history totals:', error);
    return {
      success: false,
      message: 'Failed to fetch wallet history totals',
      error: error,
    };
  }
};

export const createBank = async (req: Request, res: Response): Promise<Response> => {
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

    const { cid, bankname, accountnumber } = req.body;

    // Validate required fields
    if (!cid || !bankname || !accountnumber) {
      return res.status(400).json({ message: 'CID, bank name, and account number are required.' });
    }

    // Check if a bank entry for this CID and account number already exists
    const existingBank = await Bank.findOne({ cid, accountnumber }).exec();
    if (existingBank) {
      return res.status(409).json({ message: 'This bank account is already registered for the given CID.' });
    }

    // Create a new bank entry
    const newBank = new Bank({ cid, bankname, accountnumber });

    // Save the entry to the database
    await newBank.save();

    // Respond with success
    return res.status(201).json({
      message: 'Bank details successfully created.',
      bank: newBank,
    });
  } catch (error) {
    console.error('Error creating bank:', error);
    return res.status(500).json({
      message: 'An error occurred while creating the bank details.',
      error: error,
    });
  }
};

export const fetchBankDetailsByCID = async (req: Request, res: Response): Promise<Response> => {
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
        
    const { cid } = req.params;

    // Validate CID
    if (!cid) {
      return res.status(400).json({ message: 'CID is required to fetch bank details.' });
    }

    // Fetch bank details from the database
    const bankDetails = await Bank.find({ cid }).exec();

    // Check if no bank details were found
    if (!bankDetails.length) {
      return res.status(404).json({ message: 'No bank details found for the provided CID.' });
    }

    // Respond with bank details
    return res.status(200).json({
      message: 'Bank details fetched successfully.',
      banks: bankDetails,
    });
  } catch (error) {
    console.error('Error fetching bank details:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching bank details.',
      error: error,
    });
  }
};

export const fetchWithdrawalsByCID = async (req: Request, res: Response): Promise<Response> => {
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

    const { cid } = req.params;

    // Validate CID
    if (!cid) {
      return res.status(400).json({ message: 'CID is required to fetch withdrawals.' });
    }

    // Fetch all withdrawals for the given CID
    const withdrawals = await WalletHistory.find({ cid, type: 'withdrawal' }).exec();

    if (!withdrawals.length) {
      return res.status(404).json({ message: 'No withdrawals found for the provided CID.' });
    }

    return res.status(200).json({
      message: 'Withdrawals fetched successfully.',
      withdrawals,
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching withdrawals.',
      error: error,
    });
  }
};

/**
 * Fetch all deposits by CID
 */
export const fetchDepositsByCID = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization Header
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

    // Check Consultant Role
    const { role } = decodedToken as { role: string };
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }

    const { cid } = req.params;

    // Validate CID
    if (!cid) {
      return res.status(400).json({ message: 'CID is required to fetch deposits.' });
    }

    // Fetch deposits for the given CID
    const deposits = await WalletHistory.find({ cid, type: 'deposit' }).exec();

    if (!deposits.length) {
      return res.status(404).json({ message: 'No deposits found for the provided CID.' });
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
            movie_title: requestData?.movie_title || null,
            nameofservice: requestData?.nameofservice || null,
          };
        }
        return {
          ...deposit.toObject(),
          movie_title: null,
          nameofservice: null,
        };
      })
    );

    return res.status(200).json({
      message: 'Deposits fetched successfully.',
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

export const fetchWithdrawalById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization Header
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

    // Check Consultant Role
    const { role } = decodedToken as { role: string };
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }

    const { id } = req.params;

    // Validate ID
    if (!id) {
      return res.status(400).json({ message: 'ID is required to fetch the withdrawal.' });
    }

    // Fetch withdrawal by ID
    const withdrawal = await WalletHistory.findOne({ _id: id, type: 'withdrawal' });

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found with the given ID.' });
    }

    return res.status(200).json({
      message: 'Withdrawal fetched successfully.',
      withdrawal,
    });
  } catch (error) {
    console.error('Error fetching withdrawal:', error);
    return res.status(500).json({
      message: 'An error occurred while fetching the withdrawal.',
      error: error,
    });
  }
};

export const fetchDepositById = async (req: Request, res: Response): Promise<Response> => {
  try {

    const authHeader = req.headers.authorization;

    // Check Authorization Header
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

    // Check Consultant Role
    const { role } = decodedToken as { role: string };
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
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
      depositInNaira:
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

export const updateBankDetails = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;

    // Check Authorization Header
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

    // Check Consultant Role
    const { role } = decodedToken as { role: string };
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }
    
    const { cid } = req.body;

    if (!cid) {
      return res.status(400).json({ message: "CID is required to update bank details." });
    }

    // Fields the user is allowed to update
    const allowedUpdates = ["bankname", "accountnumber"];

    // Extract only the allowed fields from the request body
    const updates = Object.keys(req.body).reduce((acc, key) => {
      if (allowedUpdates.includes(key)) {
        acc[key] = req.body[key];
      }
      return acc;
    }, {} as { [key: string]: any });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update." });
    }

    // Find the bank document by `cid` and update the allowed fields
    const updatedBank = await Bank.findOneAndUpdate({ cid }, updates, {
      new: true, // Return the updated document
      runValidators: true, // Apply schema validations to updates
    });

    if (!updatedBank) {
      return res.status(404).json({ message: "Bank details not found for the provided CID." });
    }

    return res.status(200).json({
      message: "Bank details updated successfully.",
      bank: updatedBank,
    });
  } catch (error) {
    console.error("Error updating bank details:", error);
    return res.status(500).json({
      message: "An error occurred while updating bank details.",
      error: error,
    });
  }
};


export const getCompletedCounts = async (req: Request, res: Response) => {
  const { cid } = req.params; // Get `cid` from request parameters

  if (!cid) {
    return res.status(400).json({ message: 'Consultant ID (cid) is required' });
  }

  try {

    const authHeader = req.headers.authorization;

    // Check Authorization Header
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

    // Check Consultant Role
    const { role } = decodedToken as { role: string };
    if (role !== 'consultant') {
      return res.status(403).json({ message: 'Access denied. Consultant role required.' });
    }
    // Count completed Tasks directly by `cid`


    // Find completed Requests (where `stattusof` is 'completed') and extract `orderId`s
    const completedOrderIds = await RequestModel.find({ stattusof: 'completed' }).distinct('orderId');

    const taskCount = await Task.countDocuments({ cid, status: 'completed' });

    const assignedOrderIds = await RequestModel.find({ stattusof: { $in: ['completed', 'ongoing'] } }).distinct('orderId');

    // Count Appointments where `orderId` is in the list of completed Requests
    const appointmentCount = await AppointmentModel.countDocuments({ cid, orderId: { $in: completedOrderIds } });

    const assignedCount =  await AppointmentModel.countDocuments({ cid, orderId: { $in: assignedOrderIds } });

    // Combined count
    const totalCompleted = appointmentCount + taskCount;

    return res.status(200).json({
      completed: totalCompleted,
      conversations: appointmentCount,
      assigned : assignedCount,
    });
  } catch (error) {
    console.error('Error fetching completed counts:', error);
    return res.status(500).json({ message: 'Internal server error', error });
  }
};

export const fetchChatSettings = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params; // Get cid from request params

  try {
    // Validate if cid is provided
    if (!cid) {
      return res.status(400).json({ message: 'Consultant ID (cid) is required' });
    }

    // Find chat settings for the given cid
    const chatSettings = await ChatSettingsModel.findOne({ cid });

    // If no settings found, return a 404 response
    if (!chatSettings) {
      return res.status(404).json({ message: 'Chat settings not found' });
    }

    // Return the found chat settings
    return res.status(200).json(chatSettings);
  } catch (error) {
    console.error('Error fetching chat settings:', error);
    return res.status(500).json({ message: 'Failed to fetch chat settings', error });
  }
};

export const updateChatSettingsStatus = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params; // Extract cid from request params
  const { status } = req.body; // Extract status from request body

  try {
    // Validate input
    if (!cid) {
      return res.status(400).json({ message: 'Consultant ID (cid) is required' });
    }
    if (!['on', 'off'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either "on" or "off"' });
    }

    // Find and update chat settings
    const updatedChatSettings = await ChatSettingsModel.findOneAndUpdate(
      { cid },
      { status },
      { new: true, runValidators: true } // Return updated doc & validate input
    );

    // If no settings found, return 404
    if (!updatedChatSettings) {
      return res.status(404).json({ message: 'Chat settings not found' });
    }

    // Return updated settings
    return res.status(200).json({
      message: `Chat settings updated successfully`,
      chatSettings: updatedChatSettings,
    });
  } catch (error) {
    console.error('Error updating chat settings:', error);
    return res.status(500).json({ message: 'Failed to update chat settings', error });
  }
};

export const createChatSettings = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { cid, soundurl, status } = req.body;

    // Validate required fields
    if (!cid || !soundurl || !status) {
      return res.status(400).json({ message: 'cid, soundurl, and status are required' });
    }
    if (!['on', 'off'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either "on" or "off"' });
    }

    // Check if a chat settings entry already exists for the cid
    const existingSettings = await ChatSettingsModel.findOne({ cid });
    if (existingSettings) {
      return res.status(400).json({ message: 'Chat settings already exist for this cid' });
    }

    // Create a new chat settings entry
    const newChatSettings = new ChatSettingsModel({
      cid,
      soundurl,
      status,
    });

    // Save to database
    await newChatSettings.save();

    return res.status(201).json({
      message: 'Chat settings created successfully',
      chatSettings: newChatSettings,
    });
  } catch (error) {
    console.error('Error creating chat settings:', error);
    return res.status(500).json({ message: 'Failed to create chat settings', error });
  }
};

export const updateChatSoundUrl = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { cid } = req.params; // Extract `cid` from request params
    const { soundurl } = req.body; // Extract new `soundurl` from request body

    if (!cid) {
      return res.status(400).json({ message: "CID is required" });
    }

    if (!soundurl) {
      return res.status(400).json({ message: "Sound URL is required" });
    }

    // Find and update ChatSettings by CID
    const updatedChatSettings = await ChatSettingsModel.findOneAndUpdate(
      { cid }, 
      { soundurl }, 
      { new: true } // Return the updated document
    );

    if (!updatedChatSettings) {
      return res.status(404).json({ message: "Chat settings not found" });
    }

    return res.status(200).json({
      message: "Chat sound URL updated successfully",
      chatSettings: updatedChatSettings
    });

  } catch (error) {
    console.error("Error updating chat sound URL:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

export const sendConsultantMessage = async (req: Request, res: Response): Promise<Response> => {
  const { orderId, consultantCid, message } = req.body;
  try {
    // Find existing conversation or create a new one if not present
    let serviceChat = await ServiceChat.findOne({ orderId });
    if (!serviceChat) {
      // Only a consultant can initiate the conversation
      serviceChat = new ServiceChat({ orderId, cid: consultantCid });
      await serviceChat.save();
    }
    
    // Count consultant messages in the conversation
    const consultantMessages = await ServiceChatThread.find({ scid: serviceChat._id, role: 'consultant' }).sort({ createdAt: 1 });
    const consultantCount = consultantMessages.length;
    
    // Enforce a maximum of 2 consultant messages
    if (consultantCount >= 2) {
      return res.status(400).json({ message: 'Consultant message limit (2) reached for this conversation.' });
    }
    
    // If there is already 1 consultant message, check if the last message was from consultant
    // (i.e., user has not yet responded)
    if (consultantCount === 1) {
      const lastMessage = await ServiceChatThread.findOne({ scid: serviceChat._id }).sort({ createdAt: -1 });
      if (lastMessage && lastMessage.role === 'consultant') {
        return res.status(400).json({ message: 'Please wait for the user to respond before sending another consultant message.' });
      }
    }
    
    // Create a new consultant message thread
    const threadMessage = new ServiceChatThread({
      role: 'consultant',
      uid: consultantCid,
      scid: serviceChat._id,
      message,
    });
    
    await threadMessage.save();
    
    return res.status(201).json({
      message: 'Consultant message sent successfully.',
      conversationId: serviceChat._id,
      thread: threadMessage,
    });
  } catch (error: any) {
    console.error('Error sending consultant message:', error);
    return res.status(500).json({
      message: 'Failed to send consultant message.',
      error: error.message,
    });
  }
};

export const getServiceChatMessages = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Get Service Chat ID from query parameters
    const { scid } = req.query;
    if (!scid || typeof scid !== 'string') {
      return res.status(400).json({ message: "Service Chat ID (scid) is required." });
    }
    
    // Optional pagination parameters
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;
    
    // Fetch messages for the given ServiceChat ID, sorted by creation time (oldest first)
    const messages = await ServiceChatThread.find({ scid })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    // Count total messages for pagination metadata
    const total = await ServiceChatThread.countDocuments({ scid });
    
    return res.status(200).json({
      message: "Messages fetched successfully.",
      messages,
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};
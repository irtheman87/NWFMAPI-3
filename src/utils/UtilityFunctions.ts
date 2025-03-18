import mongoose from 'mongoose';
import AssignmentModel, { IAssignment } from '../models/Assignment';
// import AvailabilityModel, { IAvailability } from '../models/Availability';
import RequestModel, { IRequest } from '../models/Request';
import Service from '../models/Service';
import User from '../models/User';
import Extension, {IExtension} from '../models/Extension';
import Notification from '../models/Notification';
import { io, users } from '..';
import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import AdminNotificationModel from '../models/AdminNotification';
import WalletHistory from '../models/walletHistoryModel';
import WeeklySchedule from '../models/Availability';
import Wallet, { IWallet } from '../models/Wallet';

// Define the Time type
type Time = {
  hours: number;
  minutes: number;
  seconds: number;
};

// Helper function to check if request time is within availability time range
function isTimeMatch(requestTime: Time, otime: Time, ctime: Time): boolean {
  const requestMinutes = requestTime.hours * 60 + requestTime.minutes;
  const openingMinutes = otime.hours * 60 + otime.minutes;
  const closingMinutes = ctime.hours * 60 + ctime.minutes;

  return requestMinutes >= openingMinutes && requestMinutes <= closingMinutes;
}

// Main function to match requests to open availability slots
// export const matchRequestToAvailabilityAndCreateAssignment = async (requestId: string) => {
//   try {
//     // Retrieve the request data
//     const userRequest = await RequestModel.findById(requestId) as IRequest;
//     if (!userRequest) {
//       throw new Error('Request not found');
//     }

//     const { expertise, time: requestTime, userId, day } = userRequest;

//     console.log(`${expertise} ${requestTime} ${userId} ${day} Printed`);

//     // Find an available consultant with a matching day, open status, and expertise
//     const matchingAvailability = await WeeklySchedule.findOne({
//       expertise: { $in: [expertise] }, // Checks if requested expertise exists in expertise array
//       day,
//       status: 'open',
//     }) as IAvailability;

//     if (
//       matchingAvailability && 
//       matchingAvailability.otime && 
//       matchingAvailability.ctime && 
//       isTimeMatch(requestTime as Time, matchingAvailability.otime, matchingAvailability.ctime)
//     ) {
//       console.log(`${requestTime} ${matchingAvailability.otime} ${matchingAvailability.ctime} Matching`);

//       // Create a new assignment with default status of 'pending'
//       const newAssignment: IAssignment = new AssignmentModel({
//         uid: userId,
//         cid: matchingAvailability.cid,
//         expertise: expertise,
//         type: userRequest.type,
//         orderId: userRequest.orderId,
//         createdDate: new Date(),
//         status: 'pending', // Default status for new assignments
//       });

//       await newAssignment.save();
      
//       if (userRequest.type) {
//         createNotification(matchingAvailability.cid.toString(), userId, 'consultant', 'Assignment', userRequest.orderId, 'New Order', 'You have a New Order Match');
//       } else {
//         // Handle the case where orderId is undefined
//         console.error('orderId is required but not provided');
//       }
//       return { message: 'Assignment created successfully', assignment: newAssignment };
//     } else {
//       return { message: 'No available consultant matches the request criteria' };
//     }
//   } catch (error) {
//     console.error('Error matching request to availability:', error);
//     throw error;
//   }
// };


// export const fetchRequestByOrderId = async (orderId: string): Promise<IRequest | null> => {
//     try {
//       const request = await RequestModel.findOne({ orderId });
//       if (!request) {
//         console.log(`No request found for orderId: ${orderId}`);
//         return null;
//       }

//       // console.log(request);
//       // console.log(request._id);

//       matchRequestToAvailabilityAndCreateAssignment(request._id as string);
//       return request;
//     } catch (error) {
//       console.error('Error fetching request by orderId:', error);
//       throw new Error('Failed to fetch request by orderId');
//     }
//   }

  export const getServicePriceByName = async (name: string): Promise<string> => {
    try {
      // Find the service by name
      const service = await Service.findOne({ name });
  
      // Check if the service exists and return its price as a string
      const reqPrice = service?.price.toString();
      if (service) {
        return `${service.price.toString()}00`;
      } else {
        throw new Error('Service not found');
      }
    } catch (error) {
      console.error('Error fetching service price:', error);
      throw error;
    }
  };

  export const fetchUserEmailById = async (userId: string): Promise<string | null> => {
    try {
      // Check if the userId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid user ID format');
      }
  
      // Fetch the user by _id and select only the email field
      const user = await User.findById(userId).select('email');
      return user ? user.email : null;
    } catch (error) {
      console.error('Error fetching user email:', error);
      throw new Error('Failed to fetch user email');
    }
  };

  export const fetchExtensionPriceByLength = async (length: number): Promise<number | null> => {
    try {
      // Find the extension with the specified length
      const extension: IExtension | null = await Extension.findOne({ length });
  
      // Append "00" to the price and return it if the extension exists, otherwise return null
      return extension ? Number(`${extension.price}00`) : null;
    } catch (error) {
      console.error('Error fetching extension price:', error);
      throw new Error('Failed to fetch extension price');
    }
  };
  
  export const createNotification = async (
    userId: string, 
    senderId: string, 
    role: string, 
    type: string, 
    relatedId: string, 
    title: string, 
    message: string
  ): Promise<void> => {
    try {
      const notification = new Notification({
        userId,
        senderId,
        role,
        type,
        relatedId,
        title,
        message,
      });
  
      await notification.save();

      const userSocketId = users[userId];
      // const userSocketId = users[userId];
      if (userSocketId) {
        io.to(userSocketId).emit('newNotification', notification);
        console.log(`Notification sent to user ${userId}`);
      }

      console.log('Notification created:', notification);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  };

  export const createAdminNotification = async (
    type: string, 
    orderId: string, 
    title: string, 
  ): Promise<void> => {
    try {
      const notification = new AdminNotificationModel({
        title,
        type,
        orderId,
      });
  
      await notification.save();

      // const userSocketId = users[userId];
      // const userSocketId = users[userId];
     
      io.emit('adminNotification', notification);

      console.log('Admin Notification created:', notification);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  };


  export function convertToGMTPlusOne(
    timestamp: string | Date
  ): { hours: number; minutes: number; seconds: number; gmtPlusOneTime: Date } {
    try {
      // Ensure timestamp is a Date object
      const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date input");
      }
  
      // Calculate the GMT+1 offset in minutes (GMT+1 is +60 minutes)
      const gmtPlusOneOffset = 60;
  
      // Get the UTC time of the timestamp in milliseconds
      const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  
      // Apply the GMT+1 offset
      const gmtPlusOneTime = new Date(utcTime + gmtPlusOneOffset * 60000);
  
      // Extract hours, minutes, and seconds
      const hours = gmtPlusOneTime.getHours();
      const minutes = gmtPlusOneTime.getMinutes();
      const seconds = gmtPlusOneTime.getSeconds();
  
      return { hours, minutes, seconds, gmtPlusOneTime };
    } catch (error) {
      console.error("Error in convertToGMTPlusOne:", error);
      throw new Error("Failed to convert timestamp to GMT+1");
    }
  }

// Function to add wallet history with the updated model
async function addWalletHistory(
  cid: string, 
  amount: number, 
  type: 'deposit' | 'withdrawal', 
  status: 'completed' | 'pending' | 'failed',
  orderId?: string, 
  bankname?: string, 
  accountnumber?: string
): Promise<void> {
  try {
    // Check if deposit with the same orderId already exists
    if (orderId) {
      const existingHistory = await WalletHistory.findOne({ orderId, type: 'deposit' }).exec();
      if (existingHistory) {
        console.log(`Deposit with orderId ${orderId} already exists. Skipping...`);
        return; // Prevent duplicate entry
      }
    }

    // Create new wallet history entry
    const history = new WalletHistory({
      cid,
      amount,
      type,
      status,
      orderId,
      bankname,
      accountnumber,
    });

    await history.save();
    console.log('Wallet history entry added:', history);
  } catch (error) {
    console.error('Error adding wallet history:', error);
  }
}

// Function to credit the wallet
export async function credit(
  cid: string, 
  amount: number, 
  orderId?: string
): Promise<IWallet | null> {
  try {
    if (amount <= 0) throw new Error('Amount should be greater than 0');

    const wallet = await Wallet.findOne({ cid }).exec();
    if (!wallet) throw new Error('Wallet not found');

    // Check if deposit with this orderId already exists in history
    if (orderId) {
      const existingHistory = await WalletHistory.findOne({ orderId, type: 'deposit' }).exec();
      if (existingHistory) {
        console.log(`Deposit with orderId ${orderId} already recorded. Skipping wallet credit.`);
        return wallet; // Prevent duplicate deposit
      }
    }

    // Credit the wallet
    wallet.balance += amount;
    wallet.availableBalance += amount;
    await wallet.save();

    // Add wallet history
    await addWalletHistory(cid, amount, 'deposit', 'completed', orderId)
      .then(() => console.log('History added!'))
      .catch((error) => console.error('Failed to add history:', error));

    return wallet;
  } catch (error) {
    console.error('Error crediting wallet:', error);
    throw new Error('Failed to credit wallet');
  }
}


// Function to debit the wallet
export async function debit(
  cid: string, 
  amount: number, 
  bankname?: string, 
  accountnumber?: string
): Promise<IWallet | null> {
  try {
    amount = amount * 100;
    if (amount <= 0) throw new Error('Amount should be greater than 0');

    const wallet = await Wallet.findOne({ cid }).exec();
    if (!wallet) throw new Error('Wallet not found');

    if (wallet.availableBalance < amount) {
      throw new Error('Insufficient available balance');
    }

    // Create a wallet history record with status 'pending'
    await addWalletHistory(
      cid, 
      amount, 
      'withdrawal', 
      'pending',
      '',
      bankname, 
      accountnumber
    )
      .then(() => console.log('Pending withdrawal recorded in wallet history.'))
      .catch((error) => console.error('Failed to add pending wallet history:', error));

    return wallet; // No deduction is made at this point
  } catch (error) {
    console.error('Error debiting wallet:', error);
    throw new Error('Failed to debit wallet');
  }
}



const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const storage = multerS3({
  s3,
  bucket: process.env.AWS_S3_BUCKET_NAME!,
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

export const uploads = multer({ storage }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'doc', maxCount: 1 },
  { name: 'additionalFile', maxCount: 5 },
  {name: 'cacdoc', maxCount: 1} // Optional additional fields
  // Add more fields if needed
]);
// Configure multer to accept multiple fields
// export const uploads = multer({ storage }).fields([
//   { name: 'files', maxCount: 10 },         // Accept up to 10 files
//   { name: 'characterbible', maxCount: 1 }, // Accept 1 characterbible file
//   { name: 'keyart', maxCount: 10 }         // Accept up to 10 keyart files
// ]);

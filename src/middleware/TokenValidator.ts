import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import RequestModel from '../models/Request'; // Adjust path if needed
import Transaction from '../models/SetTransaction';

interface DecodedToken {
  userId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?:string;
      consultantId?: string;
    }
  }
}


// Middleware to validate token, check role as 'user', and verify matching userId
export const validateUserRequest = async (req: Request, res: Response): Promise<Response> => {
  // Retrieve the token from the Authorization header
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Access denied. No token provided.' });
  }

  const { page = 1, limit = 10, sort = 'desc' } = req.query;

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as {
      userId: string;
      role: string;
    };

    // Check if the user's role is 'user'
    if (decoded.role !== 'user') {
      return res.status(403).json({ message: 'Access denied. User only.' });
    }

    // Parse page and limit to integers and ensure valid defaults
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;

    // Find all completed transactions for the user
    const completedTransactions = await Transaction.find({ 
      userId: decoded.userId, 
      status: 'completed' 
    }).select('orderId');

    // Extract orderIds from the completed transactions
    const completedOrderIds = completedTransactions.map(transaction => transaction.orderId);

    // Get the **total count** of matching documents
    const totalRequests = await RequestModel.countDocuments({
      userId: decoded.userId,
      orderId: { $in: completedOrderIds },
      stattusof: { $ne: 'completed' }, // Exclude completed requests
    });

    // Find requests with pagination
    const requests = await RequestModel.find({
      userId: decoded.userId,
      orderId: { $in: completedOrderIds },
      stattusof: { $ne: 'completed' }, // Exclude completed requests
    })
      .sort({ updatedAt: sort === 'asc' ? 1 : -1 }) // Sort based on the sort parameter
      .skip((pageNumber - 1) * limitNumber) // Apply pagination
      .limit(limitNumber); // Limit the number of results per page

    // Check if any requests were found
    if (!requests.length) {
      return res.status(404).json({ message: 'No completed requests found for this user.' });
    }

    // Add metadata and requests to the response
    return res.status(200).json({
      message: 'Completed requests fetched successfully',
      page: pageNumber,
      limit: limitNumber,
      total: totalRequests, // Total number of matching documents
      totalPages: Math.ceil(totalRequests / limitNumber), // Calculate total pages
      requests,
    });
  } catch (error) {
    console.error('Error validating user request:', error);
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};


export const validateUserRequestForAdmin = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // User ID from route parameters
  // Retrieve the token from the Authorization header
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

  const { page = 1, limit = 10, sort = 'desc' } = req.query;

   try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as {
      role: string;
    };

    // Check if the user's role is 'user'
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. User only.' });
    }

    // Parse page and limit to integers and ensure valid defaults
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;

    // Find all completed transactions for the user
    const completedTransactions = await Transaction.find({ 
      userId: id, 
      status: 'completed' 
    }).select('orderId');

    // Extract orderIds from the completed transactions
    const completedOrderIds = completedTransactions.map(transaction => transaction.orderId);

    // Find requests where the orderId is in the completed transactions
    const requests = await RequestModel.find({
      userId: id,
      orderId: { $in: completedOrderIds },
      stattusof: { $ne: 'completed' }, // Exclude completed requests
    })
      .sort({ updatedAt: sort === 'asc' ? 1 : -1 }) // Sort based on the sort parameter
      .skip((pageNumber - 1) * limitNumber) // Apply pagination
      .limit(limitNumber); // Limit the number of results

    // Check if any requests were found
    if (!requests.length) {
      return res.status(404).json({ message: 'No completed requests found for this user.' });
    }

    // Add metadata and requests to the response
    return res.status(200).json({
      message: 'Completed requests fetched successfully',
      page: pageNumber,
      limit: limitNumber,
      total: requests.length,
      requests,
    });
  } catch (error) {
    console.error('Error validating user request:', error);
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

export const verifyUserToken = (req: Request, res: Response, next: NextFunction) => {
  // Extract token from the Authorization header
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Access denied. No token provided.' });
  }

  try {
    // Verify token and decode
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as DecodedToken;

    // Check if the user's role is 'user'
    if (decoded.role !== 'user') {
      return res.status(403).json({ message: 'Access denied. User only.' });
    }

    // Attach user ID to request for use in the next function
    req.userId = decoded.userId;

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token.' });
  }
};

  export const verifyConsultantToken = (req: Request, res: Response, next: NextFunction) => {
    // Extract token from the Authorization header
    const token = req.headers.authorization?.split(' ')[1];
  
    if (!token) {
      return res.status(403).json({ message: 'Access denied. No token provided.' });
    }
  
    try {
      // Verify token and decode
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as DecodedToken;
  
      // Check if the user's role is 'consultant'
      if (decoded.role !== 'consultant') {
        return res.status(403).json({ message: 'Access denied. Consultant only.' });
      }
  
      // Attach consultant ID to request for access in subsequent functions
      req.consultantId = decoded.userId;
  
      // Proceed to the next middleware or route handler
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token.' });
    }
  };

  

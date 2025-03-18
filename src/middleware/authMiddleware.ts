import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Retrieve the token from the Authorization header
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(403).json({ message: 'Access denied. No token provided.' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as { role: string };

    // Check if the user's role is 'admin'
    if (decoded.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Token is valid and role is admin, proceed to the next middleware
    next();
  } catch (error) {
    // Catch any errors in token verification
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};


export const isnotAdmin = (req: Request, res: Response, next: NextFunction) => {
    // Retrieve the token from the Authorization header
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(403).json({ message: 'Access denied. No token provided.' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as { role: string };

    // Check if the user's role is 'admin'
    if (decoded.role !== 'admin') {
        next();
    }
    
  } catch (error) {
    // Catch any errors in token verification
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};
import { Request, Response, NextFunction } from 'express';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization;
  
  if (token === 'secret_token') {
    next(); // Token is valid, continue to the route
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

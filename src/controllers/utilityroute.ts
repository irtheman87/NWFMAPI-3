import { Request, Response } from 'express';
import User from '../models/User';

export const verifyUserEmail = async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.status(200).json({ message: 'Email successfully verified!' });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying email', error });
  }
};

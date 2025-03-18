import { Request, Response } from 'express';
import Service from '../models/Service';

// Add new service (only accessible by admin)
export const addService = async (req: Request, res: Response) => {
  const { type, name, price, description } = req.body;

  if (!type || !name) {
    return res.status(400).json({ message: 'Please provide both type and name' });
  }

  try {
    const newService = new Service({ type, name, price, description });
    await newService.save();

    res.status(201).json({ message: 'Service added successfully', service: newService });
  } catch (error) {
    res.status(500).json({ message: 'Error adding service', error });
  }
};

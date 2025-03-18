import { Request, Response } from 'express';
import Service from '../models/Service'; // Adjust the path based on your project structure

export const fetchServicesByType = async (req: Request, res: Response) => {
  const { type } = req.params; // Assuming you're passing the type in URL parameters
  
  try {
    // Fetch services from the database that match the provided type
    const services = await Service.find({ type });

    // If no services are found, return a 404 response
    if (services.length === 0) {
      return res.status(404).json({ message: `No services found for type: ${type}` });
    }

    // Return the matching services
    return res.status(200).json(services);
  } catch (error) {
    // Handle any errors
    return res.status(500).json({ message: 'Error fetching services', error });
  }
};

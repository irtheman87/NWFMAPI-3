import AppointmentModel, { IAppointment } from '../models/Appointment';
import { Time } from '../types'; // Assuming Time type is defined in Availability model

// Function to create an appointment
export async function createAppointment(
  date: Date,
  time: Time,
  uid: string,
  cid: string,
  orderId: string
): Promise<IAppointment> {
  try {
    // Create a new appointment document
    const newAppointment = new AppointmentModel({
      date,
      time,
      uid,
      cid,
      orderId,
      creationDate: new Date(), // Automatically set to current date
    });

    // Save to the database
    const savedAppointment = await newAppointment.save();
    return savedAppointment;
  } catch (error) {
    console.error('Error creating appointment:', error);
    throw new Error('Unable to create appointment');
  }
}

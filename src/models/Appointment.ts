import mongoose, { Document, Schema } from 'mongoose';

type Time = {
  hours: number;
  minutes: number;
  seconds: number;
};

export interface IAppointment extends Document {
  date: Date;                // The date of the appointment
  time: Time;                // The time of the appointment, using hours, minutes, and seconds
  uid: string;               // User ID (could represent the client or customer)
  cid: string;               // Consultant ID
  orderId: string;           // Unique order ID associated with this appointment
  expertise: string;
  creationDate: Date;        // Date when the appointment was created
}

const timeSchema = new Schema<Time>({
  hours: { type: Number, required: true },
  minutes: { type: Number, required: true },
  seconds: { type: Number, required: true }
});

const appointmentSchema = new Schema<IAppointment>({
  date: { type: Date, required: true },
  time: { type: timeSchema, required: true },
  uid: { type: String, required: true },
  cid: { type: String, required: true },
  orderId: { type: String, required: true },
  expertise: {type: String, required: true},
  creationDate: { type: Date, required: true, default: Date.now }
});

const AppointmentModel = mongoose.model<IAppointment>('Appointment', appointmentSchema);

export default AppointmentModel;

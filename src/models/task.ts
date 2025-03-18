import mongoose, { Schema, Document } from 'mongoose';

// Define the Task interface extending mongoose.Document
export interface Task extends Document {
  date: Date;               // The date of the task
  uid: string;              // User ID (could represent the client or customer)
  cid: string;              // Consultant ID
  orderId: string;          // Unique order ID associated with this task
  expertise: string;        // Expertise field
  nameofservice: string;    // Name of the service associated with the task
  creationDate: Date;       // The date when the task was created
  status: string;           // Status of the task (e.g., 'pending', 'completed', 'cancelled')
  type: string;             // Type of the task (e.g., 'request', 'appointment', 'consultation')
}

// Define the Task schema
const TaskSchema: Schema = new Schema(
  {
    date: { type: Date, required: true },
    uid: { type: String, required: true },
    cid: { type: String, required: true },
    orderId: { type: String, required: true, unique: true },
    expertise: { type: String, required: true },
    nameofservice: { type: String, required: true }, // Name of the service
    creationDate: { type: Date, default: Date.now }, // Default to the current date and time
    status: { type: String, required: true, enum: ['pending', 'completed', 'cancelled']},
    type: {type: String, required: true, enum: ['request'], default: 'request'},
  },
  { timestamps: true } // Adds createdAt and updatedAt timestamps
);

// Export the Task model
export default mongoose.model<Task>('Task', TaskSchema);

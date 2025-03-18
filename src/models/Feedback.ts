import mongoose, { Schema, Document } from 'mongoose';

// Define the Feedback interface extending mongoose.Document
export interface Feedback extends Document {
  orderId: string;    // Unique order ID associated with the feedback
  userId: mongoose.Schema.Types.ObjectId;     // ID of the user providing feedback
  quality: number;    // Quality rating (e.g., scale from 1 to 5)
  speed: number;      // Speed rating (e.g., scale from 1 to 5)
  reason: string;     // Additional feedback/reason provided by the user
  createdAt: Date;    // Automatically handled by Mongoose's timestamps
  updatedAt: Date;    // Automatically handled by Mongoose's timestamps
}

// Define the Feedback schema
const FeedbackSchema: Schema = new Schema(
  {
    orderId: { type: String, required: true },   // Order ID reference
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },    // User ID reference
    quality: { type: Number, required: true },   // Quality rating
    speed: { type: Number, required: true },     // Speed rating
    reason: { type: String, required: false },   // Optional feedback text
  },
  { timestamps: true } // Automatically adds `createdAt` and `updatedAt`
);

// Export the Feedback model
export default mongoose.model<Feedback>('Feedback', FeedbackSchema);

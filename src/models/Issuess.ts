import mongoose, { Document, Schema } from 'mongoose';

export interface IIssue extends Document {
  uid: mongoose.Schema.Types.ObjectId;     // User ID who raised the issue
  orderId: string; // Order ID related to the issue
  title: string;   // Title of the issue
  complain: string; // Detailed complaint description
  status: 'pending' | 'opened' | 'closed'; // Status of the issue
  cid?: string;    // Consultant ID or assigned personnel
  createdAt: Date;
}

// Define the schema for Issue
const issueSchema = new Schema<IIssue>(
  {
    uid: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true },
    title: { type: String, required: true },
    complain: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'opened', 'closed'],
      default: 'pending',
    },
    cid: { type: String, required: true },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Export the model as the default export
const Issue = mongoose.model<IIssue>('Issue', issueSchema);
export default Issue;

import mongoose, { Document, Schema } from 'mongoose';

export interface IIssuesThread extends Document {
  isid: mongoose.Schema.Types.ObjectId; // Issue ID this thread is associated with
  reply: string;                        // Reply text in the thread
  uid: mongoose.Schema.Types.ObjectId; // User ID who posted the reply
  role: 'user' | 'consultant' | 'admin'; // Role of the responder
  createdAt: Date;                      // Time when the reply was created
}

// Define the schema for IssuesThread
const issuesThreadSchema = new Schema<IIssuesThread>(
  {
    isid: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    reply: { type: String, required: true },
    uid: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { 
      type: String, 
      enum: ['user', 'consultant', 'admin'], 
      required: true 
    },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Export the model as default
const IssuesThread = mongoose.model<IIssuesThread>('IssuesThread', issuesThreadSchema);
export default IssuesThread;

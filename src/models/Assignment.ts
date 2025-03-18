// models/Assignment.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IAssignment extends Document {
  uid: string;
  cid: string;
  expertise: string;
  type: string;
  orderId: string;
  createdDate: Date;
  status: string; // New status field
}

const AssignmentSchema = new Schema<IAssignment>({
  uid: { type: String, required: true},
  cid: { type: String, required: true},
  expertise: { type: String, required: true },
  type: { type: String, required: true },
  orderId: { type: String, required: true },
  createdDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'assigned', 'completed'], default: 'pending' } // Add enum and default value
});

const AssignmentModel = mongoose.model<IAssignment>('Assignment', AssignmentSchema);
export default AssignmentModel;

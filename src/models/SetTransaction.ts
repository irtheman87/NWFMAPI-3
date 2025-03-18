import mongoose, { Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Custom function to generate a unique 11-character UUID
export const generateOrderId = () => uuidv4().replace(/-/g, '').slice(0, 11);

export interface ITransaction extends Document {
  title: string;
  userId: string;
  type: string;
  orderId: string;  
  price: string;
  reference?: string;
  status?: string;
  originalOrderId?: string;
  originalOrderIdFromChat?: string;
  createdAt?: Date; // Add createdAt field
}

const transactionSchema = new Schema<ITransaction>({
  title: { type: String, required: true },
  userId: { type: String, required: true },
  type: { type: String, required: true },
  orderId: { type: String, required: true, unique: true, default: generateOrderId },
  price: { type: String, required: true },
  reference: { type: String, required: false }, // Remove `unique: true`
  status: { type: String, required: false },
  originalOrderId: {type: String, required: false},
  originalOrderIdFromChat: {type: String, required: false}
},
{
  timestamps: true, // Automatically adds createdAt and updated
}
);

const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
export default Transaction;

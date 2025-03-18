// models/ServiceChatThread.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IServiceChatThread extends Document {
  role: string;
  uid: string;
  scid: string; // ServiceChat ID (reference)
  message: string;
  createdAt: Date;
}

const ServiceChatThreadSchema = new Schema<IServiceChatThread>({
  role: { type: String, required: true },       // e.g., "consultant" or "user"
  uid: { type: String, required: true },        // User ID
  scid: { type: String, required: true },       // ServiceChat ID
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ServiceChatThread = mongoose.model<IServiceChatThread>('ServiceChatThread', ServiceChatThreadSchema);
export default ServiceChatThread;

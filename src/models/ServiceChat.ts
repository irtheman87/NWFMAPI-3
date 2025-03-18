// models/ServiceChat.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IServiceChat extends Document {
  cid: string;
  orderId: string;
  createdAt: Date;
}

const ServiceChatSchema = new Schema<IServiceChat>({
  cid: { type: String, required: true },
  orderId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ServiceChat = mongoose.model<IServiceChat>('ServiceChat', ServiceChatSchema);
export default ServiceChat;

import mongoose, { Document, Schema } from 'mongoose';

// Define the IMessage interface extending Document
export interface IMessage extends Document {
  mid: string;
  uid: string;
  role: 'user' | 'admin' | 'consultant';
  name: string;
  room: string;
  message: string;
  type: string;
  filename?: string;
  replyto?: string;
  replytoId?: string;
  replytousertype?: string;
  replytochattype?: string;
  recommendations?: {
    type: string;
    name: string;
    propic: string;
    userid: string;
  }[];
  timestamp: Date;
}

// Define the schema
const messageSchema: Schema = new Schema({
  mid: { type: String, required: true },
  uid: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'consultant'], required: true },
  name: { type: String, required: true },
  room: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String },
  filename: { type: String },
  replyto: { type: String },
  replytoId: { type: String },
  replytousertype: { type: String },
  replytochattype: { type: String },
  recommendations: [
    {
      type: { type: String, required: true },
      name: { type: String, required: true },
      propic: { type: String, required: true },
      userid: { type: String, required: true },
    },
  ],
  timestamp: { type: Date, default: Date.now },
});

// Export the model
const Message = mongoose.model<IMessage>('Message', messageSchema);
export default Message;

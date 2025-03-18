import mongoose, { Document, Schema } from 'mongoose';

// Define the IChatFile interface extending Document
export interface IChatFile extends Document {
  uid: string;
  role: 'user' | 'consultant' | 'admin';
  name: string;
  room: string;
  path: string;
  filesize: string;
  filename: string;
  timestamp: Date;
}

// Define the schema for ChatFiles
const chatFileSchema: Schema = new Schema({
  uid: { type: String, required: true },
  role: { type: String, enum: ['user', 'consultant', 'admin'], required: true },
  name: { type: String, required: true },
  room: { type: String, required: true },
  path: { type: String, required: true },
  filesize: {type: String},
  filename: {type: String}, // This could store the file path or URL
  timestamp: { type: Date, default: Date.now },
});

// Export the model
const ChatFile = mongoose.model<IChatFile>('ChatFile', chatFileSchema);
export default ChatFile;

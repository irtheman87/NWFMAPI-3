import mongoose, { Document, Schema } from 'mongoose';

export interface IChatSettings extends Document {
  cid: string; // Consultant ID
  soundUrl: string; // URL for sound notification
  status: 'on' | 'off'; // Status of the chat setting
}

const chatSettingsSchema = new Schema<IChatSettings>(
  {
    cid: { type: String, required: true, unique: true }, // Consultant ID (unique for each consultant)
    soundUrl: { type: String, required: true }, // Sound file URL
    status: { type: String, enum: ['on', 'off'], default: 'on' }, // Chat notification status
  },
  { timestamps: true } // Adds createdAt and updatedAt timestamps
);

const ChatSettingsModel = mongoose.model<IChatSettings>('ChatSettings', chatSettingsSchema);
export default ChatSettingsModel;

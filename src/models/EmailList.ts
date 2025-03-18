import mongoose, { Document, Schema } from "mongoose";

// Define EmailList interface
export interface IEmailList extends Document {
  name: string;
  email: string;
}

// Define EmailList schema
const EmailListSchema = new Schema<IEmailList>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

// Create EmailList model
const EmailList = mongoose.model<IEmailList>("EmailList", EmailListSchema);

export default EmailList;

import mongoose, { Schema, Document } from 'mongoose';

export interface IContactFormSubmission extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  agreedToPrivacyPolicy: boolean;
  submittedAt: Date;
  read: boolean;
}

const ContactFormSchema: Schema = new Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  email:     { type: String, required: true },
  phone:     { type: String, required: false }, // Optional, but you can make it required
  message:   { type: String, required: true },
  agreedToPrivacyPolicy: { type: Boolean, required: true },
  submittedAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

export default mongoose.model<IContactFormSubmission>('ContactFormSubmission', ContactFormSchema);

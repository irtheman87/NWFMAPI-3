import mongoose, { Document, Schema, Model } from 'mongoose';

// Define the interface for the Consultant Preference
export interface IConsultPreference extends Document {
  userId: string;
  iupdateOrder: 'on' | 'off';
  newOrder: 'on' | 'off';
  recommendation: 'on' | 'off';
  timezone: string;
}

// Define the schema for Consultant Preference
const consultantPreferenceSchema = new Schema<IConsultPreference>({
  userId: {
    type: String,
    required: true, // Ensuring `userId` is always provided
  },
  iupdateOrder: {
    type: String,
    enum: ['on', 'off'], // Allowed values are 'on' or 'off'
    required: true,
    default: 'off',
  },
  newOrder: {
    type: String,
    enum: ['on', 'off'], // Allowed values are 'on' or 'off'
    required: true,
    default: 'off',
  },
  recommendation: {
    type: String,
    enum: ['on', 'off'], // Allowed values are 'on' or 'off'
    required: true,
    default: 'off',
  },
  timezone: {
    type: String,
    required: true,
    default: 'UTC', // Default timezone is UTC
  },
});

// Create the model
const ConsultantPreference: Model<IConsultPreference> = mongoose.model<IConsultPreference>(
  'ConsultantPreference',
  consultantPreferenceSchema
);

export default ConsultantPreference;

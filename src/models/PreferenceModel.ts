import mongoose, { Document, Schema } from 'mongoose';

export interface IPreference extends Document {
  userId: string;
  newRequestOrder: 'on' | 'off';
  updateOnMyOrders: 'on' | 'off';
  recommendation: 'on' | 'off';
  currency: string;
  timezone: string;
}

const preferenceSchema = new Schema<IPreference>({
  userId: {type: String},
  newRequestOrder: {
    type: String,
    enum: ['on', 'off'],
    required: true,
    default: 'off',
  },
  updateOnMyOrders: {
    type: String,
    enum: ['on', 'off'],
    required: true,
    default: 'off',
  },
  recommendation: {
    type: String,
    enum: ['on', 'off'],
    required: true,
    default: 'off',
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
  },
  timezone: {
    type: String,
    required: true,
    default: 'UTC',
  },
});

const Preference = mongoose.model<IPreference>('Preference', preferenceSchema);
export default Preference;

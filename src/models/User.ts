import mongoose, { Document, Schema } from 'mongoose';

// Extend the IUser interface to include expertise, email verification fields, and createdAt
export interface IUser extends Document {
  fname: string;
  lname: string;
  phone: string;
  email: string;
  password: string;
  role: 'user' | 'admin' | 'consult';
  expertise?: string[];
  isVerified?: boolean;
  verificationToken?: string;
  profilepics?: string;
  bio?: string;
  website?: string;
  location?: {
    country?: string;
    state?: string;
    city?: string;
    postalcode?: string;
  };
  createdAt?: Date; // Add createdAt field
}

const userSchema = new Schema<IUser>(
  {
    fname: { type: String, required: true },
    lname: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin', 'consult'], default: 'user' },
    expertise: {
      type: [String],
      validate: [
        (val: string[]) => val.length <= 8,
        'Expertise array cannot exceed 8 items',
      ],
    },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    profilepics: { type: String },
    bio: { type: String },
    website: { type: String },
    location: {
      country: { type: String },
      state: { type: String },
      city: { type: String },
      postalcode: { type: String },
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

const User = mongoose.model<IUser>('User', userSchema);
export default User;

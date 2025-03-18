import mongoose, { Document, Schema } from 'mongoose';

export interface IConsultant extends Document {
  fname: string;
  lname: string;
  phone: string;
  email: string;
  password: string;
  role: 'consultant';
  status: string;
  expertise?: string[];
  profilepics?: string;
  bio?: string;
  website?: string;
  location?: {
    country?: string;
    state?: string;
    city?: string;
    postalcode?: string;
  };
  verificationToken?: string;
  createdAt?: Date; // Add createdAt field

}

const consultSchema = new Schema<IConsultant>(
  {
    fname: { type: String, required: true },
    lname: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String},
    role: { type: String, enum: ['consultant'], default: 'consultant', required: true },
    status: {type: String},
    expertise: {
      type: [String],
      validate: [
        (val: string[]) => val.length <= 10,
        'Expertise array cannot exceed 10 items',
      ],
    },    
    profilepics: { type: String },
    bio: { type: String },
    website: { type: String },
    location: {
      country: { type: String },
      state: { type: String },
      city: { type: String },
      postalcode: { type: String },
    },
    verificationToken: { type: String }
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

const Consultant = mongoose.model<IConsultant>('Consultant', consultSchema);
export default Consultant;

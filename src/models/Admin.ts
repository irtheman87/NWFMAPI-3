import mongoose, { Document, Schema } from 'mongoose';

export interface IAdmin extends Document {
  fname: string;
  lname: string;
  phone: string;
  email: string;
  password: string;
  role: 'admin';
  expertise?: string[];
}

const adminSchema = new Schema<IAdmin>(
  {
    fname: { type: String, required: true },
    lname: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin'], default: 'admin', required: true },
    expertise: {
      type: [String],
      validate: [
        (val: string[]) => val.length <= 5,
        'Expertise array cannot exceed 5 items',
      ],
    },  
  },
  { timestamps: true }
);

const Admin = mongoose.model<IAdmin>('Admin', adminSchema);
export default Admin;

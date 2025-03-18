import mongoose, { Schema, Document } from "mongoose";

// Interface for CrewCompany document
export interface ICrewCompany extends Document {
  username: string;
  email: string;
  password: string;
  verificationToken?: string;
}

// Schema for CrewCompany
const CrewCompanySchema: Schema = new Schema<ICrewCompany>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    verificationToken: {
      type: String
    }
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
  }
);

// Define and export the model
const CrewCompany = mongoose.model<ICrewCompany>("CrewCompany", CrewCompanySchema);

export default CrewCompany;

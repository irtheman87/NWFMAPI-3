import mongoose, { Schema, Document } from "mongoose";

// Define interfaces for specific fields
interface Clientele {
  title: string;
  link: string;
  year: number;
}

interface Location {
  address: string;
  city: string;
  state: string;
  country: string;
}

// Define the Company interface
type CompanyDocument = Document & {
  name: string;
  email: string;
  userId: string;
  mobile: string;
  website?: string;
  bio?: string;
  propic?: string;
  type: string;
  clientele?: Clientele[];
  useRateCard: boolean;
  rateCard?: string;
  fee?: string;
  location: Location;
  verificationDocType: string;
  document: string;
  idNumber: string;
  cacNumber: string;
  cacdoc: string;
  apiVetting?: boolean;
  verified?: boolean;
  badgelink?: string;
  failed?: boolean;
  note?: string;
  nfscore?: string;
};

// Define the schema for the Company model
const CompanySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    userId: {type: String},
    mobile: { type: String, required: true },
    website: { type: String },
    bio: { type: String },
    propic: { type: String },
    type: { type: String, required: true },
    clientele: [
      {
        title: { type: String},
        link: { type: String },
        year: { type: Number},
      },
    ],
    useRateCard: { type: Boolean, required: true },
    rateCard: { type: String },
    fee: { type: String },
    location: {
      address: { type: String},
      city: { type: String},
      state: { type: String},
      country: { type: String},
    },
    verificationDocType: { type: String, required: true },
    document: { type: String, required: true },
    idNumber: { type: String, required: true },
    cacNumber: { type: String, required: false },
    cacdoc: { type: String, required: true },
    apiVetting: { type: Boolean },
    verified: { type: Boolean },
    badgelink: { type: String },
    failed  : { type: Boolean },
    note: { type: String },
    nfscore: { type: String },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
  }
);

// Export the Company model
const Company = mongoose.model<CompanyDocument>("Company", CompanySchema);
export default Company;

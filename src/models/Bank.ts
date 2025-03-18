import mongoose, { Document, Schema } from 'mongoose';

// Define the IBank interface extending Document
export interface IBank extends Document {
  cid: string;
  bankname: string;
  accountnumber: string;
  createdAt: Date;
  updatedAt: Date;
}

// Define the schema
const bankSchema: Schema = new Schema(
  {
    cid: { type: String, required: true },
    bankname: { type: String, required: true },
    accountnumber: { type: String, required: true },
  },
  {
    timestamps: true, // Automatically adds `createdAt` and `updatedAt`
  }
);

// Export the model
const Bank = mongoose.model<IBank>('Bank', bankSchema);
export default Bank;

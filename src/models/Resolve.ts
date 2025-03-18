import mongoose, { Schema, Document } from 'mongoose';

// Define the Resolve interface extending mongoose.Document
export interface Resolve extends Document {
  orderId: string;       // Unique order ID associated with the resolve
  filename : string;// Names of the uploaded files
  filepath :  string;   // Paths to the files in the storage system
  createdAt: Date;       // Timestamp when the resolve record was created
  size : Number;       // Sizes of the files in bytes
}

// Define the Resolve schema
const ResolveSchema: Schema = new Schema(
  {
    orderId: { type: String, required: true},
    filename: { type: String, required: true }, // Array of file names
    filepath: { type: String, required: true }, // Array of file paths
    createdAt: { type: Date, default: Date.now }, // Automatically set the creation timestamp
    size: { type: Number, required: true }, // Array of sizes for each file in bytes
  },
  { timestamps: true } // Adds createdAt and updatedAt fields automatically
);

// Export the Resolve model
export default mongoose.model<Resolve>('Resolve', ResolveSchema);

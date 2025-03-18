import mongoose, { Schema, Document } from 'mongoose';

export interface IMusing extends Document {
  userId: mongoose.Types.ObjectId; // Reference to the user
  summary: string; // Summary of musings or notes
  createdAt: Date; // Automatically created timestamp
}

const musingSchema = new Schema<IMusing>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // Use Schema.Types.ObjectId
    summary: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Automatically create timestamps
  }
);

const MusingModel = mongoose.model<IMusing>('Musing', musingSchema);
export default MusingModel;

import mongoose, { Document, Schema } from 'mongoose';

// Define Sound Interface
export interface ISound extends Document {
  name: string;
  url: string;
}

// Define Schema
const soundSchema = new Schema<ISound>(
  {
    name: { type: String, required: true, unique: true }, // Unique sound name
    url: { type: String, required: true }, // Sound file URL
  },
  { timestamps: true } // Auto-create createdAt & updatedAt fields
);

// Create Model
const SoundModel = mongoose.model<ISound>('Sound', soundSchema);
export default SoundModel;

import mongoose, { Document, Schema } from 'mongoose';

export interface IExtension extends Document {
  length: number;
  price: number;
}

const extensionSchema = new Schema<IExtension>({
  length: { type: Number},
  price: { type: Number },
});

const Extension = mongoose.model<IExtension>('Extension', extensionSchema);
export default Extension;

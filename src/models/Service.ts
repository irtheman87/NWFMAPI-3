import mongoose, { Document, Schema } from 'mongoose';

export interface IService extends Document {
  type: string;
  name: string;
  price: number;
  description: string;
}

const serviceSchema = new Schema<IService>({
  type: { type: String, required: true },
  name: { type: String, required: true },
  price: {type: Number, required: true},
  description: {type: String, required: true}
});

const Service = mongoose.model<IService>('Service', serviceSchema);
export default Service;

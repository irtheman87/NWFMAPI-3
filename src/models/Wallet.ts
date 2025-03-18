import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
  cid: string;
  balance: number;
  availableBalance: number;
  status: 'unverified' | 'verified' | 'hold';
  dateCreated: Date;
}

const walletSchema = new Schema<IWallet>({
  cid: { type: String, required: true, unique: true },
  balance: { type: Number, required: true, default: 0 },
  availableBalance: { type: Number, required: true, default: 0 },
  status: { 
    type: String, 
    enum: ['unverified', 'verified', 'hold'], 
    required: true, 
    default: 'unverified' 
  },
  dateCreated: { type: Date, required: true, default: Date.now },
});

const Wallet = mongoose.model<IWallet>('Wallet', walletSchema);
export default Wallet;

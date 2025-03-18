import mongoose, { Document, Schema } from "mongoose";

export interface IAttendance extends Document {
  roomId: string;
  uid?: string; // Can be blank
  cid?: string; // Can be blank
  uidJoined?: Date; // Time of entry or update for uid
  cidJoined?: Date; // Time of entry or update for cid
}

const attendanceSchema = new Schema<IAttendance>(
  {
    roomId: { type: String, required: true }, // Room ID is required
    uid: { type: String, default: null }, // User ID (optional)
    cid: { type: String, default: null }, // Consultant ID (optional)
    uidJoined: { type: Date, default: null }, // Timestamp for UID joining
    cidJoined: { type: Date, default: null }, // Timestamp for CID joining
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt
);

const Attendance = mongoose.model<IAttendance>("Attendance", attendanceSchema);
export default Attendance;

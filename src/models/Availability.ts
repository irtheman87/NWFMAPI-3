import mongoose, { Schema, Document, Types } from "mongoose";

// Interface for individual slot entry
interface Slot extends Document {
  cid: mongoose.Schema.Types.ObjectId; // Reference to consultant
  expertise: string[]; // Areas of expertise
  status: "open" | "closed"; // Slot status
  day: string; // Day of the week
  slots: string[]; // Array of time slots (e.g., ["09:00", "11:00"])
}

// Define the schema for a schedule slot
const SlotSchema = new Schema<Slot>({
  cid: { type: Schema.Types.ObjectId, ref: "Consultant", required: true },
  expertise: { type: [String], required: true },
  status: { type: String, enum: ["open", "closed"], required: true },
  day: {
    type: String,
    enum: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    required: true,
  },
  slots: { type: [String], required: true },
});

// Define the schema for the complete weekly schedule
const WeeklyScheduleSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true }, // Reference to a user or related document
    schedule: [SlotSchema], // Array of daily slots
  },
  { timestamps: true } // Automatically include createdAt and updatedAt timestamps
);

// Define and export the model
const WeeklySchedule = mongoose.model("WeeklySchedule", WeeklyScheduleSchema);

export default WeeklySchedule;

import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: string;  // Reference to the user's ID (recipient)
  senderId: string;  // Reference to the sender's ID
  role: string;                      // User's role (e.g., 'admin', 'consultant', 'client')
  type: string;                      // Type of notification (e.g., 'alert', 'reminder')
  relatedId: string; // The ID associated with this notification (e.g., order ID, task ID)
  title: string;                     // Notification title or summary
  message?: string;                  // Optional detailed message for the notification
  isRead?: boolean;                  // Optional field to track if the notification has been read
  createdAt?: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: {
    type: String,
    required: true,
    ref: 'User',  // Assuming there is a User model to reference
  },
  senderId: {
    type: String,
    required: true,
    ref: 'User',  // Reference to the User who is sending the notification
  },
  role: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  relatedId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    default: '',
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Notification = mongoose.model<INotification>('Notification', notificationSchema);

export default Notification;

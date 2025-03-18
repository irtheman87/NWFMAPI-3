import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminNotification extends Document {
  title: string;
  type: string; // Notification type
  orderId: string; // Associated Order ID
  status: string; // Status of the notification
  createdAt?: Date; // Automatic timestamp
  updatedAt?: Date; // Automatic timestamp
}

const AdminNotificationSchema = new Schema<IAdminNotification>(
  {
    title: { type: String, required: true },
    type: { type: String, required: true }, // Notification type, e.g., 'new-request', 'order-update'
    orderId: { type: String, required: true }, // Associated Order ID
    status: { type: String, required: false, default: 'unread' }, // Default set to 'unread'
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

const AdminNotificationModel = mongoose.model<IAdminNotification>('AdminNotification', AdminNotificationSchema);

export default AdminNotificationModel;

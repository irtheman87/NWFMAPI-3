import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './database';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import Notification from './models/Notification';

dotenv.config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.urlencoded({ extended: true })); // For form-data bodies
app.use(express.json());

// Log and set up static folder for uploads
const uploadsPath = path.join(__dirname, '..', 'uploads');
console.log("Serving static files from:", uploadsPath); // Debugging path
app.use('/uploads', express.static(uploadsPath));

// Setup server and socket.io
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
  },
});

const users: { [userId: string]: string } = {}; // userId to socketId mapping

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('register', (userId: string) => {
    users[userId] = socket.id;
    console.log(`User ${userId} connected with socket ID ${socket.id}`);
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of Object.entries(users)) {
      if (socketId === socket.id) {
        delete users[userId];
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});


// Connect to the database
connectDB();

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/consultants', require('./routes/consultRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/admin-services', require('./routes/adminServiceRoutes'));
app.use('/api/chat', require('./routes/chatRoute'));
app.use('/api/join', require('./routes/joinRoute'));
app.use('/api/cronjobs', require('./routes/cronRoute'));

export { io, users };

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

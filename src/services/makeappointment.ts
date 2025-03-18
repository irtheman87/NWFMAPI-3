import { createAppointment } from "./appointmentService";

async function makeAppointment() {
    try {
      const date = new Date('2024-12-15'); // Example date
      const time = { hours: 10, minutes: 30, seconds: 0 }; // Example time
      const uid = 'user123';
      const cid = 'consultant456';
      const orderId = 'order789';
  
      const appointment = await createAppointment(date, time, uid, cid, orderId);
      console.log('Appointment created successfully:', appointment);
    } catch (error) {
      console.error('Failed to create appointment:', error);
    }
  }
  
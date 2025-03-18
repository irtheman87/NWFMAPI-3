import nodemailer from 'nodemailer';

// Function to send emails using Brevo SMTP
const sendEmail = async ({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => {
  console.log('SMTP Server:', process.env.SMTP_SERVER);

  // Create the transporter using Brevo SMTP settings
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER, // SMTP server (e.g., smtp-relay.sendinblue.com)
    port: 465, // Using Port 465 for Implicit SSL/TLS encryption
    secure: true, // True for SSL/TLS encryption
    auth: {
      user: process.env.SMTP_USER, // Your Brevo email
      pass: process.env.SMTP_PASS, // Your Brevo SMTP password
    },
  });

  // Send the email
  try {
    await transporter.sendMail({
      from: '"Nollywood Filmmaker" <no-reply@nollywoodfilmmaker.com>', // Sender email
      to, // Recipient email
      subject, // Email subject
      text, // Plain text version
      html: html || `<p>${text}</p>`, // HTML version (fallback to plain text)
      replyTo: 'support@nollywoodfilmmaker.com', // Improve legitimacy
    });

    console.log('Email sent successfully via ZeptoMail');
  } catch (error) {
    console.error('Error sending email via ZeptoMail:', error);
    throw new Error('Email sending failed');
  }
};

export default sendEmail;

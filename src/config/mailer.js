// [TV3] Cấu hình Nodemailer gửi email xác thực & vé điện tử QR
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: process.env.SMTP_FROM || '"Nhà Xe Phương Trang FUTA" <no-reply@futabus.vn>',
    to,
    subject,
    html,
  });
}

module.exports = { transporter, sendMail };

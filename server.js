import express from 'express'
import nodemailer from 'nodemailer'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 5000


app.use(express.json())

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  methods: ['POST'],
}))

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})


const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

transporter.verify((err) => {
  if (err) {
    console.error('❌ SMTP connection failed:', err.message)
  } else {
    console.log('✅ SMTP ready — transporter verified')
  }
})


function validate({ name, email, message }) {
  const errors = []
  if (!name    || name.trim().length    < 2)   errors.push('Name must be at least 2 characters.')
  if (!email   || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required.')
  if (!message || message.trim().length < 10)  errors.push('Message must be at least 10 characters.')
  if (name    && name.length    > 100) errors.push('Name is too long.')
  if (message && message.length > 3000) errors.push('Message is too long.')
  return errors
}


function htmlTemplate({ name, email, message }) {
  const safe = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { margin:0; padding:0; background:#050810; font-family:'Courier New',monospace; }
    .wrap { max-width:560px; margin:0 auto; padding:32px 24px; }
    .header { border-bottom:1px solid #1a2a3a; padding-bottom:20px; margin-bottom:24px; }
    .logo { color:#00f0ff; font-size:18px; font-weight:bold; }
    .label { font-size:10px; letter-spacing:3px; text-transform:uppercase; color:#4a6a80; margin-bottom:4px; }
    .value { color:#e2eaf7; font-size:14px; margin-bottom:20px; line-height:1.6; }
    .msg-box { background:#0c1120; border:1px solid #1a2a3a; border-left:3px solid #020073; padding:16px 20px; margin-top:8px; }
    .footer { margin-top:32px; padding-top:20px; border-top:1px solid #1a2a3a; font-size:11px; color:#4a6a80; }
    .accent { color:#00f0ff; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo">&lt;<span style="color:#e2eaf7">darken</span>/&gt;</div>
      <div style="color:#4a6a80;font-size:12px;margin-top:6px;">New message from your portfolio</div>
    </div>

    <div class="label">Sender</div>
    <div class="value"><span class="accent">${safe(name)}</span></div>

    <div class="label">Email</div>
    <div class="value"><a href="mailto:${safe(email)}" style="color:#4f8eff;text-decoration:none;">${safe(email)}</a></div>

    <div class="label">Message</div>
    <div class="msg-box value">${safe(message).replace(/\n/g, '<br/>')}</div>

    <div class="footer">
      Sent via your portfolio contact form · ${new Date().toUTCString()}
    </div>
  </div>
</body>
</html>`
}

function autoReplyTemplate({ name }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { margin:0; padding:0; background:#050810; font-family:'Courier New',monospace; }
    .wrap { max-width:560px; margin:0 auto; padding:32px 24px; }
    .logo { color:#00f0ff; font-size:18px; font-weight:bold; margin-bottom:8px; }
    .text { color:#e2eaf7; font-size:14px; line-height:1.8; margin-bottom:16px; }
    .muted { color:#4a6a80; font-size:12px; }
    .divider { height:1px; background:#1a2a3a; margin:24px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">&lt;<span style="color:#e2eaf7">darken</span>/&gt;</div>
    <div class="divider"></div>
    <div class="text">Hi ${name.split(' ')[0]},</div>
    <div class="text">
      Thanks for reaching out — your message has been received. I'll get back to you as soon as possible, usually within 24–48 hours.
    </div>
    <div class="text">Talk soon,<br/><span style="color:#00f0ff">Behzodbek</span></div>
    <div class="divider"></div>
    <div class="muted">This is an automated reply. Please do not respond to this email.</div>
  </div>
</body>
</html>`
}


app.post('/api/contact', limiter, async (req, res) => {
  const { name, email, message } = req.body

  const errors = validate({ name, email, message })
  if (errors.length) {
    return res.status(400).json({ error: errors[0] })
  }

  try {
    await transporter.sendMail({
      from:    process.env.MAIL_FROM,
      to:      process.env.MAIL_TO,
      replyTo: email,
      subject: `[Portfolio] New message from ${name.trim()}`,
      html:    htmlTemplate({ name: name.trim(), email: email.trim(), message: message.trim() }),
    })

    await transporter.sendMail({
      from:    process.env.MAIL_FROM,
      to:      email.trim(),
      subject: `Got your message, ${name.split(' ')[0]}!`,
      html:    autoReplyTemplate({ name: name.trim() }),
    })

    console.log(`📨 Contact form: message from ${name} <${email}>`)
    res.json({ success: true, message: 'Message sent successfully!' })

  } catch (err) {
    console.error('❌ Email send error:', err.message)
    res.status(500).json({ error: 'Failed to send message. Please try again later.' })
  }
})

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`)
})

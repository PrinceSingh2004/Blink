const db = require('../config/db');
const mailer = require('../config/mailer');

exports.submitContact = async (req, res) => {
    try {
        const { name, email, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Save to DB
        await db.query(
            'INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)',
            [name, email, message]
        );

        // Optional: Send email notification to admin
        await mailer.sendMail(
            process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            `New Contact Message from ${name}`,
            `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
        );

        res.status(201).json({ message: 'Message sent successfully. We will get back to you soon.' });

    } catch (err) {
        console.error('[Contact] Error:', err.message);
        res.status(500).json({ error: 'Server error while sending message' });
    }
};

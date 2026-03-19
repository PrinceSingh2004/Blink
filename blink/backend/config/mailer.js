const nodemailer = require('nodemailer');
const env = require('./env');

// ── Create transporter lazily so missing credentials don't crash boot ──
let _transporter = null;

function getTransporter() {
    if (_transporter) return _transporter;
    if (!env.EMAIL_USER || !env.EMAIL_PASS) {
        console.warn('[Mailer] EMAIL_USER/EMAIL_PASS not set – email will not be sent.');
        return null;
    }
    _transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: env.EMAIL_USER,
            pass: env.EMAIL_PASS,
        }
    });
    return _transporter;
}

/**
 * Send an email.
 * @returns {Promise<boolean>} true if sent, false if failed or not configured
 */
exports.sendMail = async (to, subject, text) => {
    const transporter = getTransporter();
    if (!transporter) return false;
    try {
        await transporter.sendMail({
            from: `"Blink App" <${env.EMAIL_USER}>`,
            to,
            subject,
            text
        });
        return true;
    } catch (error) {
        console.error('[Mailer] Send error:', error.message);
        return false;
    }
};

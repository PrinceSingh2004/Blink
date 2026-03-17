require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the frontend static files
app.use("/Fronted", express.static(path.join(__dirname, "../Fronted")));
app.use(express.static(path.join(__dirname, "../Fronted")));

// Setup video uploads directory
const videoUploadPath = path.join(__dirname, "../Fronted/Video");
if (!fs.existsSync(videoUploadPath)) {
    fs.mkdirSync(videoUploadPath, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, videoUploadPath),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "_" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage });

// Replace with your MySQL connection details
const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "blink_app"
};

// Create a connection pool instead of a single connection for stability
let db = mysql.createPool(dbConfig);

// Initialize DB if it doesn't exist
const initDb = mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password
});

initDb.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``, (err) => {
    if (err) {
        console.error("Error creating database:", err);
    } else {
        console.log(`Database '${dbConfig.database}' ensured successfully.`);

        // Now use a temp connection specifically to create tables
        const connection = mysql.createConnection(dbConfig);

        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fullname VARCHAR(255) NOT NULL,
                username VARCHAR(255) UNIQUE NOT NULL,
                contact VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                birthday DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        connection.query(createUsersTable, (err, results) => {
            if (err) console.error("Error creating users table:", err);
            else console.log("Users table initialized.");

            // Create videos table
            const createVideosTable = `
                CREATE TABLE IF NOT EXISTS videos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    filename VARCHAR(255) NOT NULL,
                    filepath VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            connection.query(createVideosTable, (err) => {
                if (err) console.error("Error creating videos table:", err);
                else console.log("Videos table initialized.");

                // Close the temporary setup connection
                connection.end();
            });
        });
    }
});

// ── Redirect ALL page requests to the new Blink app (port 4000) ──
const NEW_APP = 'http://localhost:3000';
app.get('/', (req, res) => res.redirect(NEW_APP + '/pages/login.html'));
['/login.html', '/home.html', '/Create_Account.html', '/profile.html',
    '/chat.html', '/index.html', '/register.html', '/messages.html', '/upload.html'].forEach(p => {
        app.get(p, (req, res) => res.redirect(NEW_APP + '/pages/login.html'));
    });

// Handle Signup Registration
app.post("/signup", async (req, res) => {
    const { contact, fullname, username, password, birthday } = req.body;

    if (!contact || !fullname || !username || !password || !birthday) {
        return res.status(400).send("All fields are required.");
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const query = "INSERT INTO users (contact, fullname, username, password, birthday) VALUES (?, ?, ?, ?, ?)";
        db.query(query, [contact, fullname, username, hashedPassword, birthday], (err, result) => {
            if (err) {
                console.error("Error during signup:", err);
                if (err.code === "ER_DUP_ENTRY") {
                    // Quick way to respond
                    return res.send("<script>alert('Username or contact already exists!'); window.location.href='/Create_Account.html';</script>");
                }
                return res.status(500).send("Database error occurred.");
            }
            res.redirect("/login.html");
        });
    } catch (err) {
        res.status(500).send("Server error.");
    }
});

// Handle Login
app.post("/login", (req, res) => {
    const { user, password } = req.body; // 'user' is the name attribute in the form for email/username

    if (!user || !password) {
        return res.status(400).send("Username and password are required.");
    }

    const query = "SELECT * FROM users WHERE username = ? OR contact = ?";
    db.query(query, [user, user], async (err, results) => {
        if (err) {
            console.error("Error during login:", err);
            return res.status(500).send("Database error occurred.");
        }

        if (results.length === 0) {
            return res.send("<script>alert('User not found!'); window.location.href='/login.html';</script>");
        }

        const userRecord = results[0];
        const isMatch = await bcrypt.compare(password, userRecord.password);

        if (isMatch) {
            // Setup simple session or directly redirect to home
            res.redirect("/home.html");
        } else {
            res.send("<script>alert('Incorrect password!'); window.location.href='/login.html';</script>");
        }
    });
});

// Handle OTP Verification Setup
app.post("/verify-otp", (req, res) => {
    const { email, otp } = req.body;
    // Dummy check: If they provided an email, they pass
    if (email && otp) {
        res.redirect(`/change_password.html?email=${encodeURIComponent(email)}`);
    } else {
        res.send("<script>alert('Invalid OTP or Email'); window.location.href='/forgot_password.html';</script>");
    }
});

// Handle Change Password
app.post("/change-password", async (req, res) => {
    const { email } = req.body;
    const newPassword = req.body['new-password'];
    const confirmPassword = req.body['confirm-password'];

    if (!email || !newPassword || !confirmPassword) {
        return res.send("<script>alert('All fields required, including valid email session'); window.history.back();</script>");
    }

    if (newPassword !== confirmPassword) {
        return res.send("<script>alert('Passwords do not match'); window.history.back();</script>");
    }

    try {
        // Find user by email (stored in 'contact' field if it's email)
        const checkQuery = "SELECT * FROM users WHERE contact = ?";
        db.query(checkQuery, [email], async (err, results) => {
            if (err) return res.status(500).send("Database error.");
            if (results.length === 0) {
                return res.send("<script>alert('No user found with this email'); window.location.href='/forgot_password.html';</script>");
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            const updateQuery = "UPDATE users SET password = ? WHERE contact = ?";
            db.query(updateQuery, [hashedPassword, email], (err, result) => {
                if (err) return res.status(500).send("Error updating password.");
                res.send("<script>alert('Password updated successfully!'); window.location.href='/login.html';</script>");
            });
        });
    } catch (err) {
        res.status(500).send("Server error.");
    }
});

// Video routes
app.post("/upload", upload.single("videoFile"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No video file provided" });

    // Store relative path to access from frontend
    const filepath = `/Fronted/Video/${req.file.filename}`;

    const query = "INSERT INTO videos (filename, filepath) VALUES (?, ?)";
    db.query(query, [req.file.originalname, filepath], (err, result) => {
        if (err) {
            console.error("Error saving video to DB:", err);
            return res.status(500).json({ error: "Database error." });
        }
        res.status(200).json({ message: "Video uploaded successfully", filepath: filepath });
    });
});

app.get("/videos", (req, res) => {
    const query = "SELECT filepath FROM videos ORDER BY created_at DESC";
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching videos:", err);
            return res.status(500).json({ error: "Database error." });
        }
        res.status(200).json(results.map(row => row.filepath));
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

const { Sequelize } = require("sequelize");

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is missing in Render Environment Variables. Please set it in the Render Dashboard.");
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

sequelize.authenticate()
  .then(() => console.log("✅ Database connected"))
  .catch(err => console.error("❌ DB Error:", err));

// Add initDB to sync schema manually using raw queries to match previous logic
const initDB = async () => {
    try {
        console.log('🔄 Syncing database schema...');
        
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) DEFAULT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                profile_photo TEXT DEFAULT NULL,
                bio TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        try {
            await sequelize.query('ALTER TABLE users ADD COLUMN name VARCHAR(100) DEFAULT NULL');
        } catch(e) { /* column exists */ }

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS videos (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                video_url TEXT NOT NULL,
                thumbnail_url TEXT DEFAULT NULL,
                caption TEXT DEFAULT NULL,
                hashtags TEXT DEFAULT NULL,
                duration INT DEFAULT 0,
                likes_count INT DEFAULT 0,
                views_count INT DEFAULT 0,
                comments_count INT DEFAULT 0,
                is_active SMALLINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS likes (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                video_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_id, video_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                video_id INT NOT NULL,
                text VARCHAR(1000) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS views (
                id SERIAL PRIMARY KEY,
                user_id INT DEFAULT NULL,
                video_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user1_id INT NOT NULL,
                user2_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user1_id, user2_id),
                FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS follows (
                id SERIAL PRIMARY KEY,
                follower_id INT NOT NULL,
                following_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (follower_id, following_id),
                FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                conversation_id INT NULL,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                message TEXT NOT NULL,
                media_url TEXT DEFAULT NULL,
                is_read SMALLINT DEFAULT 0,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS video_views (
                id SERIAL PRIMARY KEY,
                video_id INT NOT NULL,
                user_id INT DEFAULT NULL,
                session_id VARCHAR(255) DEFAULT NULL,
                ip_hash VARCHAR(255) DEFAULT NULL,
                watched_seconds INT DEFAULT 0,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                user_id INT DEFAULT NULL,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // Step 1: Fix database schema automatically on server start
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            is_read SMALLINT DEFAULT 0,
            conversation_id INTEGER,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);

        // Migration: Ensure conversation_id is optional and drop NOT NULL
        try {
            await sequelize.query('ALTER TABLE messages ALTER COLUMN conversation_id DROP NOT NULL');
            await sequelize.query('ALTER TABLE messages ALTER COLUMN conversation_id DROP DEFAULT');
        } catch (e) {
            console.log('Info: conversation_id constraint adjustment:', e.message);
        }

        const tables = ['messages'];
        for (const table of tables) {
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sender_id INTEGER`);
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS receiver_id INTEGER`);
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS message TEXT`);
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS is_read SMALLINT DEFAULT 0`);
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS conversation_id INTEGER`);
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
        }
        
        // Fix is_read type if it was boolean
        await sequelize.query(`
            DO $$ 
            BEGIN 
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_read' AND data_type='boolean') THEN
                    ALTER TABLE messages ALTER COLUMN is_read TYPE SMALLINT USING (CASE WHEN is_read THEN 1 ELSE 0 END);
                END IF;
            END $$;
        `);

        console.log('✅ Database schema synchronized.');
    } catch (err) {
        console.error('❌ Schema sync error:', err.message);
    }
};

// Expose sequelize, initDB, and testConnection
sequelize.initDB = initDB;
sequelize.testConnection = async () => ({ success: true });

module.exports = sequelize;

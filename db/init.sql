-- ═══════════════════════════════════════════════════════════
-- Blink — Complete Database Schema (Expert Implementation)
-- Features: Foreign Keys, Unique Constraints, Performance Indexes
-- ═══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS chats;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS followers;
DROP TABLE IF EXISTS users;

-- 1. USERS TABLE
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    bio TEXT,
    profile_pic TEXT,
    profile_photo TEXT, -- Legacy support
    follower_count INT DEFAULT 0,
    following_count INT DEFAULT 0,
    is_live BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_username (username)
);

-- 2. FOLLOWERS TABLE
CREATE TABLE followers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL,
    following_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. POSTS TABLE
CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    media_url TEXT NOT NULL,
    caption TEXT,
    likes_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. CHATS TABLE (Live Chat Persistence)
CREATE TABLE chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stream_id VARCHAR(100) NOT NULL,
    user_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_stream (stream_id)
);

-- ═══════════════════════════════════════════════════════════
-- Initial Mock Data (Optional, delete in production)
-- ═══════════════════════════════════════════════════════════
-- INSERT INTO users (username, email, password) VALUES ('blink_team', 'team@blink.app', '$2a$10$YourHashedPassword');

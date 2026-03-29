-- ════════════════════════════════════════════════════════════════════════════════
-- BLINK PLATFORM - PRODUCTION DATABASE SCHEMA
-- MySQL 8.0+ | Optimized for Railway
-- ════════════════════════════════════════════════════════════════════════════════

DROP DATABASE IF EXISTS railway;
CREATE DATABASE railway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE railway;

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. USERS TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE users (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    username            VARCHAR(50) UNIQUE NOT NULL,
    email               VARCHAR(255) UNIQUE NOT NULL,
    password            VARCHAR(255) NOT NULL,
    display_name        VARCHAR(100),
    bio                 TEXT,
    profile_pic         VARCHAR(500),
    cover_pic           VARCHAR(500),
    website             VARCHAR(500),
    is_private          BOOLEAN DEFAULT FALSE,
    is_verified         BOOLEAN DEFAULT FALSE,
    followers_count     INT DEFAULT 0,
    following_count     INT DEFAULT 0,
    posts_count         INT DEFAULT 0,
    likes_count         INT DEFAULT 0,
    last_active         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_created (created_at),
    INDEX idx_last_active (last_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. FOLLOWERS TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE followers (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    user_id         INT NOT NULL,
    follower_id     INT NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (user_id, follower_id),
    INDEX idx_user (user_id),
    INDEX idx_follower (follower_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. VIDEOS TABLE (For Reels/Posts)
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE videos (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    user_id         INT NOT NULL,
    title           VARCHAR(255),
    description     TEXT,
    video_url       VARCHAR(500) NOT NULL,
    thumbnail_url   VARCHAR(500),
    duration        INT,
    width           INT,
    height          INT,
    is_public       BOOLEAN DEFAULT TRUE,
    likes_count     INT DEFAULT 0,
    comments_count  INT DEFAULT 0,
    views_count     INT DEFAULT 0,
    shares_count    INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_created (created_at),
    INDEX idx_public (is_public),
    FULLTEXT ft_title_desc (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. LIKES TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE likes (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    user_id     INT NOT NULL,
    video_id    INT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE KEY unique_like (user_id, video_id),
    INDEX idx_video (video_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. COMMENTS TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE comments (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    video_id    INT NOT NULL,
    user_id     INT NOT NULL,
    comment     TEXT NOT NULL,
    likes_count INT DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_video (video_id),
    INDEX idx_user (user_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. MESSAGES TABLE (Real-time Chat)
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE messages (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    sender_id       INT NOT NULL,
    receiver_id     INT NOT NULL,
    message         TEXT NOT NULL,
    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sender (sender_id),
    INDEX idx_receiver (receiver_id),
    INDEX idx_created (created_at),
    INDEX idx_is_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 7. LIVE STREAMS TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE live_streams (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    user_id         INT NOT NULL,
    title           VARCHAR(255),
    description     TEXT,
    status          ENUM('OFFLINE', 'LIVE', 'ENDED') DEFAULT 'OFFLINE',
    thumbnail_url   VARCHAR(500),
    viewers_count   INT DEFAULT 0,
    started_at      TIMESTAMP NULL,
    ended_at        TIMESTAMP NULL,
    duration_sec    INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 8. LIVE VIEWERS TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE live_viewers (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    live_stream_id  INT NOT NULL,
    user_id         INT,
    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at         TIMESTAMP NULL,
    
    FOREIGN KEY (live_stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_stream (live_stream_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 9. STORIES TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE stories (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    user_id         INT NOT NULL,
    media_url       VARCHAR(500) NOT NULL,
    media_type      ENUM('image', 'video') DEFAULT 'image',
    duration_ms     INT DEFAULT 5000,
    viewers_count   INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 10. NOTIFICATIONS TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE notifications (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    user_id         INT NOT NULL,
    actor_id        INT,
    type            ENUM('like', 'comment', 'follow', 'message') DEFAULT 'like',
    target_id       INT,
    message         VARCHAR(255),
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 11. AUTH ATTEMPTS LOG (Rate Limiting)
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE auth_attempts (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    ip_address      VARCHAR(45),
    user_id         INT,
    attempt_count   INT DEFAULT 1,
    last_attempt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    locked_until    TIMESTAMP NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_ip (ip_address),
    INDEX idx_locked (locked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- 12. SAVED VIDEOS TABLE
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE saved_videos (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    user_id     INT NOT NULL,
    video_id    INT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE KEY unique_save (user_id, video_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════════════
-- CREATE INDEXES FOR PERFORMANCE
-- ════════════════════════════════════════════════════════════════════════════════

-- Analytical queries optimization
ALTER TABLE videos ADD INDEX idx_user_created (user_id, created_at);
ALTER TABLE likes ADD INDEX idx_video_created (video_id, created_at);
ALTER TABLE comments ADD INDEX idx_video_created (video_id, created_at);
ALTER TABLE messages ADD INDEX idx_conversation (sender_id, receiver_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════════
-- SAMPLE DATA (Optional - for testing)
-- ════════════════════════════════════════════════════════════════════════════════

INSERT INTO users (username, email, password, display_name, bio) VALUES
('demo_user', 'demo@blink.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/KFm', 'Demo User', 'Testing Blink Platform');

-- ════════════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ════════════════════════════════════════════════════════════════════════════════

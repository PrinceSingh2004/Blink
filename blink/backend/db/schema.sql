-- ════════════════════════════════════════════════════════════════════
-- Blink Social Platform – Complete Database Schema v3.0
-- MySQL 8.0+ | Railway Compatible
-- ════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'NO_ENGINE_SUBSTITUTION';

-- ── USERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                INT          AUTO_INCREMENT PRIMARY KEY,
    username          VARCHAR(50)  UNIQUE NOT NULL,
    email             VARCHAR(255) UNIQUE NOT NULL,
    password          VARCHAR(255) NOT NULL,
    display_name      VARCHAR(100),
    bio               TEXT,
    profile_pic       TEXT,
    avatar_url        TEXT,
    profile_photo     TEXT,
    website           VARCHAR(255),
    location          VARCHAR(100),
    is_private        BOOLEAN      DEFAULT FALSE,
    is_verified       BOOLEAN      DEFAULT FALSE,
    is_live           BOOLEAN      DEFAULT FALSE,
    followers_count   INT          DEFAULT 0,
    following_count   INT          DEFAULT 0,
    posts_count       INT          DEFAULT 0,
    push_token        VARCHAR(255),
    last_seen         TIMESTAMP    NULL,
    created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── FOLLOWS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followers (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    follower_id   INT NOT NULL,
    following_id  INT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_follow (follower_id, following_id),
    FOREIGN KEY (follower_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_follower   (follower_id),
    INDEX idx_following  (following_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── POSTS (Photo/Video Posts) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
    id             INT          AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL,
    media_url      TEXT         NOT NULL,
    media_type     ENUM('image','video') DEFAULT 'image',
    thumbnail_url  TEXT,
    caption        TEXT,
    hashtags       TEXT,
    mood_category  VARCHAR(50)  DEFAULT 'General',
    location       VARCHAR(100),
    is_blink_moment BOOLEAN     DEFAULT FALSE,
    views_count    INT          DEFAULT 0,
    likes_count    INT          DEFAULT 0,
    comments_count INT          DEFAULT 0,
    shares_count   INT          DEFAULT 0,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id   (user_id),
    INDEX idx_created   (created_at DESC),
    INDEX idx_mood      (mood_category),
    FULLTEXT INDEX ft_caption (caption, hashtags)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── VIDEOS (TikTok/Reels) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
    id             INT          AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL,
    url            TEXT         NOT NULL,
    video_url      TEXT,
    thumbnail_url  TEXT,
    caption        TEXT,
    hashtags       TEXT,
    mood_category  VARCHAR(50)  DEFAULT 'General',
    duration       FLOAT        DEFAULT 0,
    width          INT          DEFAULT 0,
    height         INT          DEFAULT 0,
    is_blink_moment BOOLEAN     DEFAULT FALSE,
    views_count    INT          DEFAULT 0,
    likes_count    INT          DEFAULT 0,
    comments_count INT          DEFAULT 0,
    shares_count   INT          DEFAULT 0,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created (created_at DESC),
    INDEX idx_mood    (mood_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── POST LIKES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_likes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_like (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_post (post_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── VIDEO LIKES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_likes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    video_id   INT NOT NULL,
    user_id    INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vlike (video_id, user_id),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    INDEX idx_video (video_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── COMMENTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
    id         INT  AUTO_INCREMENT PRIMARY KEY,
    video_id   INT  NULL,
    post_id    INT  NULL,
    user_id    INT  NOT NULL,
    parent_id  INT  NULL,
    text       TEXT NOT NULL,
    likes_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id)  REFERENCES videos(id)   ON DELETE CASCADE,
    FOREIGN KEY (post_id)   REFERENCES posts(id)    ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    INDEX idx_video  (video_id),
    INDEX idx_post   (post_id),
    INDEX idx_user   (user_id),
    INDEX idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── STORIES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stories (
    id          INT  AUTO_INCREMENT PRIMARY KEY,
    user_id     INT  NOT NULL,
    media_url   TEXT NOT NULL,
    media_type  ENUM('image','video') DEFAULT 'image',
    caption     TEXT,
    duration    INT  DEFAULT 5,
    views_count INT  DEFAULT 0,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user       (user_id),
    INDEX idx_expires    (expires_at),
    INDEX idx_created    (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── STORY VIEWS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_views (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    story_id   INT NOT NULL,
    user_id    INT NOT NULL,
    viewed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_story_view (story_id, user_id),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── NOTIFICATIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          INT  AUTO_INCREMENT PRIMARY KEY,
    user_id     INT  NOT NULL,
    actor_id    INT  NOT NULL,
    type        ENUM('like','comment','follow','mention','live','system') NOT NULL,
    entity_type ENUM('post','video','story','comment','user') NULL,
    entity_id   INT  NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN  DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user      (user_id),
    INDEX idx_read      (is_read),
    INDEX idx_created   (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CHAT ROOMS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_rooms (
    id         INT  AUTO_INCREMENT PRIMARY KEY,
    room_id    VARCHAR(100) UNIQUE NOT NULL,
    user1_id   INT  NOT NULL,
    user2_id   INT  NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_room (room_id),
    INDEX idx_users (user1_id, user2_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── MESSAGES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id          INT  AUTO_INCREMENT PRIMARY KEY,
    room_id     VARCHAR(100) NOT NULL,
    sender_id   INT  NOT NULL,
    message     TEXT NOT NULL,
    media_url   TEXT NULL,
    media_type  VARCHAR(20) NULL,
    is_read     BOOLEAN  DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_room      (room_id),
    INDEX idx_sender    (sender_id),
    INDEX idx_created   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── LIVE STREAMS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_streams (
    id          INT  AUTO_INCREMENT PRIMARY KEY,
    host_id     INT  NOT NULL,
    title       VARCHAR(255) DEFAULT 'Live Stream',
    description TEXT,
    thumbnail   TEXT,
    stream_key  VARCHAR(100) UNIQUE,
    viewers     INT          DEFAULT 0,
    is_live     BOOLEAN      DEFAULT TRUE,
    started_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    ended_at    TIMESTAMP    NULL,
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_host    (host_id),
    INDEX idx_is_live (is_live)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── LIVE CHAT MESSAGES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_chat (
    id          INT  AUTO_INCREMENT PRIMARY KEY,
    stream_id   INT  NOT NULL,
    user_id     INT  NOT NULL,
    username    VARCHAR(50),
    text        TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)        ON DELETE CASCADE,
    INDEX idx_stream (stream_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── SAVED POSTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_posts (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    post_id    INT NULL,
    video_id   INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_save_post  (user_id, post_id),
    UNIQUE KEY uq_save_video (user_id, video_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── BLOCKED USERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_users (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    blocker_id   INT NOT NULL,
    blocked_id   INT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_block (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

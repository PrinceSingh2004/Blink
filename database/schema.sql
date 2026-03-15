-- Users Table
CREATE TABLE IF NOT EXISTS Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    profile_photo VARCHAR(255) DEFAULT '/default-avatar.png',
    cover_image VARCHAR(255),
    bio TEXT,
    website_link VARCHAR(255),
    location VARCHAR(100),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Followers Table
CREATE TABLE IF NOT EXISTS Followers (
    follower_id INT,
    following_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Videos Table
CREATE TABLE IF NOT EXISTS Videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    video_url VARCHAR(255) NOT NULL,
    thumbnail_url VARCHAR(255),
    caption TEXT,
    location VARCHAR(100),
    hashtags VARCHAR(255),
    mood_category ENUM('Happy', 'Learning', 'Gaming', 'Motivation', 'Music', 'General') DEFAULT 'General',
    is_blink_moment BOOLEAN DEFAULT FALSE, -- Disappears after 24 hrs unless saved
    expires_at TIMESTAMP NULL, -- Set if is_blink_moment is true
    parent_video_id INT NULL, -- For Video Replies
    collab_user_id INT NULL, -- For Collab Videos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_video_id) REFERENCES Videos(id) ON DELETE SET NULL,
    FOREIGN KEY (collab_user_id) REFERENCES Users(id) ON DELETE SET NULL
);

-- Likes Table
CREATE TABLE IF NOT EXISTS Likes (
    user_id INT,
    video_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, video_id),
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES Videos(id) ON DELETE CASCADE
);

-- Comments Table
CREATE TABLE IF NOT EXISTS Comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT,
    user_id INT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES Videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Saved Videos Table
CREATE TABLE IF NOT EXISTS Saved_Videos (
    user_id INT,
    video_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, video_id),
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES Videos(id) ON DELETE CASCADE
);

-- Messages Table
CREATE TABLE IF NOT EXISTS Messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT,
    receiver_id INT,
    content TEXT,
    media_url VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS Notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    sender_id INT,
    type ENUM('Follow', 'Like', 'Comment', 'Mention', 'Message') NOT NULL,
    target_id INT, -- Video ID or Comment ID depending on type
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Communities Table
CREATE TABLE IF NOT EXISTS Communities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    creator_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES Users(id) ON DELETE SET NULL
);

-- Community_Members Table
CREATE TABLE IF NOT EXISTS Community_Members (
    community_id INT,
    user_id INT,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id),
    FOREIGN KEY (community_id) REFERENCES Communities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Live Streams Table
CREATE TABLE IF NOT EXISTS Live_Streams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    stream_key VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255),
    is_live BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

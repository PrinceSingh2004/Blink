-- ═══════════════════════════════════════════════════════════
-- Blink Profile Migration
-- Adds all Task 2 fields & creates Followers, Views, and Block lists
-- ═══════════════════════════════════════════════════════════

-- 1. Upgrade Users Table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS full_name VARCHAR(60) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS account_type ENUM('personal','creator','business') DEFAULT 'personal',
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cover_photo TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cover_public_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS profession VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS company VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS skills TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS languages VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gender ENUM('male','female','prefer_not_to_say','custom') DEFAULT 'prefer_not_to_say',
ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS website VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS date_of_birth DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS social_instagram VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS social_youtube VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS social_twitter VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS social_linkedin VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS social_whatsapp VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS social_telegram VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS social_facebook VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS follower_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS following_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS post_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_likes INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_views INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_complete_score INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS show_online_status BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_created_at ON users(created_at);

-- 3. Followers Table
CREATE TABLE IF NOT EXISTS followers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_follow (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_following (following_id),
  INDEX idx_follower (follower_id)
);

-- 4. Profile Views Table
CREATE TABLE IF NOT EXISTS profile_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_user_id INT NOT NULL,
  viewer_user_id INT DEFAULT NULL,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_profile_views (profile_user_id)
);

-- 5. Block List Table
CREATE TABLE IF NOT EXISTS user_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_block (blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Trigger to Update Scores (Simplified query approach)
-- You will call this calculation from JS/Node after every update

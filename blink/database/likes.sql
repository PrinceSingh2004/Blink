USE blink_app;

-- Tracks which user liked which video (prevents duplicate likes)
CREATE TABLE IF NOT EXISTS video_likes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    video_id   INT NOT NULL,
    user_id    INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_like (video_id, user_id),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

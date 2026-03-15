USE blink_app;

CREATE TABLE IF NOT EXISTS videos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL,
    video_url      VARCHAR(500) NOT NULL,
    caption        TEXT         DEFAULT NULL,
    likes_count    INT          DEFAULT 0,
    comments_count INT          DEFAULT 0,
    shares_count   INT          DEFAULT 0,
    mood_category  VARCHAR(50)  DEFAULT 'General',
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

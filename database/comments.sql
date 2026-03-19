USE blink_app;

CREATE TABLE IF NOT EXISTS comments (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    video_id     INT  NOT NULL,
    user_id      INT  NOT NULL,
    comment_text TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

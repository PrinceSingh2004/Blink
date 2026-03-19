-- Blink App – Schema
-- Run these files in order: users, videos, comments, likes, followers, messages

CREATE DATABASE IF NOT EXISTS blink_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE blink_app;

CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  UNIQUE NOT NULL,
    email           VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(500) DEFAULT NULL,
    bio             TEXT         DEFAULT NULL,
    followers_count INT          DEFAULT 0,
    following_count INT          DEFAULT 0,
    total_likes     INT          DEFAULT 0,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

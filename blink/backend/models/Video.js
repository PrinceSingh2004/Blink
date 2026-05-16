const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Video = sequelize.define('Video', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    video_url: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    thumbnail_url: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    caption: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    hashtags: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    duration: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    likes_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    views_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    comments_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    is_active: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
    },
}, {
    tableName: 'videos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
});

module.exports = Video;

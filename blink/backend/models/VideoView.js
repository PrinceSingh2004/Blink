const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const VideoView = sequelize.define("VideoView", {
  video_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  session_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ip_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  watched_seconds: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: "video_views",
  timestamps: true,
});

module.exports = VideoView;

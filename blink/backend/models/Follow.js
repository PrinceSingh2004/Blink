const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Follow = sequelize.define("Follow", {
  follower_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  following_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: "follows",
  timestamps: true,
});

module.exports = Follow;

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Message = sequelize.define("Message", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sender_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  receiver_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  is_read: {
    type: DataTypes.SMALLINT,
    defaultValue: 0,
  },
  conversation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_forwarded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  deleted_for_sender: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  deleted_for_receiver: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: "messages",
  timestamps: true,
});

module.exports = Message;

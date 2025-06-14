const mongoose = require('../db/conn')
const { Schema } = mongoose

const User = mongoose.model(
  'users',
  new Schema(
    {
      photo: {
        type: String,
      },
      name: {
        type: String,
        required: true,
      },
      birthday: {
        type: Date,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },

      role: {
        type: String,
        required: true,
      },
      roleNumber: {
        type: Number,
        required: true,
      },

      hourStart: {
        type: Number,
        required: true,
      },

      hourEnd: {
        type: Number,
        required: true,
      },

      permissions: {
        type: Object,
      },

      email: {
        type: String,
        required: true,
      },
      password: {
        type: String,
        required: true,
      },

      session_token: {
        type: String,
      },
      socket_id: {
        type: String,
      },
    },
    { timestamps: true },
  ),
)

module.exports = User

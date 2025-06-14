const mongoose = require('../db/conn')
const { Schema } = mongoose

const logsSchema = new Schema(
  {
    integration: String,
    integrationId: String,
    user: String,
    userId: String,
    action: String,
    message: String,
    observacoes: Array,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000,
    },
  },
  { timestamps: true },
)

const Logs = mongoose.model('Logs', logsSchema)

module.exports = Logs

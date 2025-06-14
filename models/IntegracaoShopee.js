const mongoose = require('../db/conn')
const { Schema } = mongoose

const IntegracaoShopeeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },

    short_name: {
      type: String,
      required: true,
      unique: true,
    },

    seller_id: {
      type: String,
    },

    partner_id: {
      type: String,
    },

    partner_key: {
      type: String,
    },

    refresh_token: {
      type: String,
    },

    lastAccess_token: {
      token: {
        type: String,
      },
      updateAt: {
        type: Date,
      },
    },

    code: {
      type: String,
    },

    status: {
      type: String,
      required: true,
    },

    order: {
      type: Number,
    },

    permitirAPI: {
      type: Boolean,
    },

    secret: {
      type: String,
    },
  },
  { timestamps: true },
)

IntegracaoShopeeSchema.pre('save', function (next) {
  if (this.isModified('lastAccess_token.token')) {
    this.lastAccess_token.updateAt = new Date()
  }
  next()
})

const integracaoShopee = mongoose.model('integracaoShopee', IntegracaoShopeeSchema)

module.exports = integracaoShopee

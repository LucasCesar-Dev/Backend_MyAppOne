const mongoose = require('../db/conn')
const { Schema } = mongoose

const IntegracaoMLSchema = new Schema(
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
    configs: {
      precificacao: {
        activate: {
          type: Boolean,
        },
        pause: {
          type: Boolean,
        },
        replicate: {
          type: Boolean,
        },
        change_stock: {
          type: Boolean,
        },
        default_stock: {
          type: Number,
        },
        cents_bellow: {
          type: Boolean,
        },
        default_cents: {
          type: Number,
        },
      },
      promocao: {
        id: {
          type: String,
        },
        type: {
          type: String,
        },
        percent: {
          type: Number,
        },
      },
    },
  },
  { timestamps: true },
)

IntegracaoMLSchema.pre('save', function (next) {
  if (this.isModified('lastAccess_token.token')) {
    this.lastAccess_token.updateAt = new Date()
  }
  next()
})

const IntegracaoML = mongoose.model('integracaoML', IntegracaoMLSchema)

module.exports = IntegracaoML

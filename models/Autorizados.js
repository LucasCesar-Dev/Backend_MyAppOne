const mongoose = require('../db/conn')
const { Schema } = mongoose

const Autorizados = mongoose.model(
  'autorizados',
  new Schema(
    {
      name: {
        type: String,
        required: true,
      },
      birthday: {
        type: Date,
        required: true,
      },

      photo: {
        type: String,
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

      products: {
        pricing: {
          type: Boolean,
          required: true,
        },
        productCreate: {
          type: Boolean,
          required: true,
        },
        productList: {
          type: Boolean,
          required: true,
        },
        productUpdate: {
          type: Boolean,
          required: true,
        },
        salesReports: {
          type: Boolean,
          required: true,
        },
      },

      picking: {
        picking: {
          type: Boolean,
          required: true,
        },
        pickingMap: {
          type: Boolean,
          required: true,
        },
      },

      ecommerce: {
        activePricing: {
          type: Boolean,
          required: true,
        },
        melhoria: {
          type: Boolean,
          required: true,
        },
        times: {
          type: Boolean,
          required: true,
        },
      },

      email: {
        type: String,
        required: true,
      },
      password: {
        type: String,
        required: true,
      },

      conclusao: {
        type: String,
        required: true,
      },
    },
    { timestamps: true },
  ),
)

module.exports = Autorizados

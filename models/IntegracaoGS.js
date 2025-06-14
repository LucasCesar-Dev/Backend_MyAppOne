const mongoose = require('../db/conn')
const { Schema } = mongoose

const relacionamentoSchema = new Schema({
  abaId: String,
  timer: Number,
  sku: { type: Schema.Types.Mixed, default: false },
  cost: { type: Schema.Types.Mixed, default: false },
  rm: { type: Schema.Types.Mixed, default: false },
  rmf: { type: Schema.Types.Mixed, default: false },
  searchForm: { type: Schema.Types.Mixed, default: false },
  comfirm: { type: Schema.Types.Mixed, default: false },
  catalog: { type: Schema.Types.Mixed, default: false },
  peso: { type: Schema.Types.Mixed, default: false },
})

const IntegracaoGSSchema = new Schema(
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

    code: {
      type: String,
    },
    status: {
      type: String,
      required: true,
    },
    sheetId: {
      type: String,
    },
    order: {
      type: Number,
    },

    tabela_relacionamento: relacionamentoSchema,
  },
  { timestamps: true },
)

const IntegracaoGS = mongoose.model('integracaoGS', IntegracaoGSSchema)

module.exports = IntegracaoGS

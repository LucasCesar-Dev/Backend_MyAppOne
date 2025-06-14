const mongoose = require('../db/conn')
const { Schema } = mongoose

const freteSchema = new Schema({
  de: { type: Number, required: true },
  ate: { type: Number, required: true },
  nrm: { type: Number, required: true },
  esp: { type: Number, required: true },
})

const freteSchema2 = new Schema({
  de: { type: Number, required: true },
  ate: { type: Number, required: true },
  custo: { type: Number, required: true },
})

const Precificacao = mongoose.model(
  'precificacao',
  new Schema(
    {
      name: {
        type: String,
      },
      custo_fixo: {
        type: Number,
      },
      custo_variavel: {
        type: Number,
      },

      lucro_minimo: {
        type: Number,
      },
      lucro_ideal: {
        type: Number,
      },
      taxa_fixa_ml: {
        type: Number,
      },
      porcentagem_ml_classico: {
        type: Number,
      },
      porcentagem_ml_premium: {
        type: Number,
      },

      porcentagem_mgl: {
        type: Number,
      },
      taxa_fixa_mgl: {
        type: Number,
      },

      tabela_fretes_ml: [freteSchema],
      tabela_fretes_mgl: [freteSchema2],
    },
    { timestamps: true },
  ),
)

module.exports = Precificacao

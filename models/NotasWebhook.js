const mongoose = require('../db/conn')
const { Schema } = mongoose

const NotasWebhook = mongoose.model(
  'notas_webhook',
  new Schema(
    {
      idIntegracao: {
        type: String,
        required: true,
      },
      status: {
        type: String,
        required: true,
      },
      dataEmissao: {
        type: Date,
        required: true,
      },
      versao: {
        type: String,
        required: true,
      },
      cnpj: {
        type: String,
        required: true,
      },
      tipo: {
        type: String,
        required: true,
      },
      dados: {
        chaveAcesso: {
          type: String,
          required: true,
          unique: true,
        },
        numero: {
          type: Number,
          required: true,
        },
        serie: {
          type: String,
          required: true,
        },
        urlDanfe: {
          type: String,
          required: true,
        },
        dataEmissao: {
          type: Date,
          required: true,
        },
        valorNota: {
          type: Number,
          required: true,
        },
        idNotaFiscalTiny: {
          type: Number,
          required: true,
        },
      },
    },
    { timestamps: true },
  ),
)

module.exports = NotasWebhook

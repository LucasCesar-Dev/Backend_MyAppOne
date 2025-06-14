const mongoose = require('../db/conn')
const { Schema } = mongoose

const IntegracaoTinySchema = new Schema(
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

    cnpj: {
      type: String,
      required: true,
      unique: true,
    },

    clientId: {
      type: String,
      required: true,
      unique: true,
    },

    clientSecret: {
      type: String,
      required: true,
      unique: true,
    },

    refresh_token: {
      type: String,
    },

    tokenApi_v2: {
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
      compras: {
        permitirCompras: {
          type: Boolean,
        },

        timerCompras: {
          type: Number,
        },

        dataCompras: {
          type: String,
        },

        ignorar: {
          type: Array,
        },
      },
      vendas: {
        permitirVendas: {
          type: Boolean,
        },

        dataVendas: {
          type: String,
        },

        timerVendas: {
          type: Number,
        },

        ignorar: {
          type: Array,
        },
      },
      transferencias: {
        permitirTransf: {
          type: Boolean,
        },
        permitirOrigem: {
          type: Boolean,
        },
        integrationOrigem: {
          type: String,
        },
        integrationTinyId: {
          type: String,
        },
        emissionHour: {
          type: Number,
        },
        qntItens: {
          type: Number,
        },
        incluirNota: {
          type: Boolean,
        },
        emitirNota: {
          type: Boolean,
        },
        importarNota: {
          type: Boolean,
        },
        lancarEstoque: {
          type: Boolean,
        },
        natureza_operacao: {
          type: String,
        },
        id_natureza_operacao: {
          type: Number,
        },
        id_deposito: {
          type: Number,
        },
        versao_api: {
          type: String,
        },
        codigo: {
          type: String,
        },
        nameConta: {
          type: String,
        },
        tipoPessoa: {
          type: String,
        },
        contribuinte: {
          type: String,
        },
        cnpjConta: {
          type: String,
        },
        inscricao: {
          type: String,
        },
        cep: {
          type: String,
        },
        municipio: {
          type: String,
        },
        estado: {
          type: String,
        },
        endereco: {
          type: String,
        },
        bairro: {
          type: String,
        },
        enderecoNro: {
          type: String,
        },
        complemento: {
          type: String,
        },
        telefone: {
          type: String,
        },
        email: {
          type: String,
        },
      },
      produtos: {
        permitirCusto: {
          type: Boolean,
        },
      },
    },
  },
  { timestamps: true },
)

const IntegracaoTiny = mongoose.model('integracaoTiny', IntegracaoTinySchema)

module.exports = IntegracaoTiny

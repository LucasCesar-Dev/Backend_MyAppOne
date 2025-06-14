const mongoose = require('../db/conn')
const { Schema } = mongoose

const ItemSchema = new Schema({
  codigo: String,
  descricao: String,
  unidade: String,
  quantidade: Number,
  valor_unitario: Number,
  idTiny: String,
  transferido: Boolean,
})

const NotaFiscalSchema = new Schema(
  {
    idIntegracao: String,
    cnpjIntegracao: String,
    dataNota: Date,
    emissionHour: Number,
    qntItens: Number,
    timeEmissao: Date,
    status: String,
    tipo: String,
    natureza_operacao: String,
    idTiny: String,
    numero: String,
    xml: String,
    chaveAcesso: String,
    idTinyDestino: String,
    numeroDestino: String,
    cliente: {
      natureza_operacao: String,
      id_natureza_operacao: Number,
      codigo: String,
      nome: String,
      tipoPessoa: String,
      contribuinte: String,
      cnpj: String,
      ie: String,
      cep: String,
      municipio: String,
      uf: String,
      endereco: String,
      bairro: String,
      enderecoNro: String,
      complemento: String,
      fone: String,
      email: String,
    },
    itens: [ItemSchema],
    forma_pagamento: String,
    parcelas: [
      {
        data: String,
        valor: String,
      },
    ],
    frete_por_conta: String,
    valor_frete: String,
    permissoes: {
      incluirNota: Boolean,
      emitirNota: Boolean,
      importarNota: Boolean,
      lancarEstoque: Boolean,
    },
    error: String,
  },
  { timestamps: true },
)

const NotaFiscal = mongoose.model('NotaFiscal', NotaFiscalSchema)

module.exports = NotaFiscal

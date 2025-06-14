const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()
const axios = require('axios')
const fs = require('node:fs')
const path = require('node:path')
const ProductFunctions = require('../utils/ProductFunctions')
const NotaFiscal = require('../models/NotasTiny')
const NotasWebhook = require('../models/NotasWebhook')
const mongoose = require('mongoose')
const IntegracaoTiny = require('../models/IntegracaoTiny')
const IntegrationFunctions = require('../utils/IntegrationFunctions')

const RandomFunctions = require('../utils/RandomFunctions')
const Logs = require('../models/Logs')

module.exports = class WebhooksController {
  static async TinyProdutos(req, res) {
    const produto = req.body.dados

    if (produto.classeProduto === 'S') {
      if (!produto.gtin) {
        res
          .status(200)
          .json([
            {
              idMapeamento: Number.parseInt(produto.idMapeamento),
              skuMapeamento: '',
              error: 'Produto sem EAN',
            },
          ])
          .end()
        return
      }

      if (!produto.codigo) {
        res
          .status(200)
          .json([
            {
              idMapeamento: Number.parseInt(produto.idMapeamento),
              skuMapeamento: '',
              error: 'Produto sem SKU',
            },
          ])
          .end()
        return
      }

      if (!produto.nome) {
        res
          .status(200)
          .json([
            {
              idMapeamento: Number.parseInt(produto.idMapeamento),
              skuMapeamento: '',
              error: 'Produto sem Nome',
            },
          ])
          .end()
        return
      }

      const whereCondition = {
        OR: [
          { gtin: { equals: produto.gtin } },
          { tinyId: { equals: produto.id } },
          { sku: { equals: produto.codigo } },
        ],
      }

      const existingProduct = await prisma.produtos.findFirst({
        where: whereCondition,
      })

      if (existingProduct) {
        res
          .status(200)
          .json([
            {
              idMapeamento: Number.parseInt(produto.idMapeamento),
              skuMapeamento: existingProduct.id,
              urlProduto: `http://localhost:3000/app/edit/product/${existingProduct.id}`,
            },
          ])
          .end()

        return
      }

      let imagemBaixada = false
      try {
        if (produto.anexos[0].url) {
          imagemBaixada = await ProductFunctions.downloadAndSaveImage(
            { photo: produto.anexos[0].url, sku: produto.codigo },
            process.env.API,
          )
        }
      } catch (error) {}

      const marca = await prisma.marcas.findFirst({
        where: {
          name: produto.marca,
        },
      })

      const produtoCriado = await prisma.produtos.create({
        data: {
          sku: produto.codigo,
          tinyId: produto.id,
          name: produto.nome,
          ...(imagemBaixada ? { photo: imagemBaixada } : {}),
          gtin: produto.gtin,
          ncm: produto.ncm ? produto.ncm : null,
          cost: 0,
          ...(marca ? { brand: { connect: { id: marca.id } } } : {}),
        },
      })

      res.status(200).json([
        {
          idMapeamento: Number.parseInt(produto.idMapeamento),
          skuMapeamento: produtoCriado.id,
          urlProduto: `http://localhost:3000/app/edit/product/${produtoCriado.id}`,
        },
      ])
    } else {
      res
        .status(200)
        .json([
          {
            idMapeamento: Number.parseInt(produto.idMapeamento),
            skuMapeamento: '',
            error:
              '<strong><br>Você só pode enviar produtos simples ao MyAppOne.. Combos e Kits devem ser criados por lá !</br></strong>',
          },
        ])
        .end()
      return
    }
  }

  static async notasFiscaisTiny(req, res) {
    res.status(200).end()

    const nota = req.body

    try {
      const integracao = await IntegracaoTiny.findOne({ cnpj: nota.cnpj })
      if (
        integracao.configs.transferencias.permitirTransf &&
        integracao.status === 'active'
      ) {
        const dataEmissao = new Date()
        dataEmissao.setHours(0, 0, 0, 0)

        const novaNota = new NotasWebhook({
          idIntegracao: integracao._id,
          status: 'aberto',
          dataEmissao: dataEmissao,
          ...nota,
        })

        await novaNota.save()
      }
    } catch (error) {
      console.log('error no webhook de notas: ', error)
    }
  }

  static async rotaTeste(req, res) {
    console.log('req.body: ', req.body)

    res.status(200).end()
  }

  static async processarNota() {
    const notas = await NotasWebhook.find({
      status: 'aberto',
    }).limit(100)

    try {
      const maxIterationsPerMinute = 120
      const delayBetweenIterations = 60000 / maxIterationsPerMinute
      let lastExecutionTime = Date.now()

      for (let i = 0; i < notas.length; i++) {
        const nota = notas[i]

        const startIterationTime = Date.now()

        const session = await mongoose.startSession()
        try {
          session.startTransaction()

          const cnpj = String(nota.cnpj)
          const idNota = nota.dados.idNotaFiscalTiny
          const integracao = await IntegracaoTiny.findOne({ cnpj: cnpj }).session(session)
          const notaTiny = await Functions.getNotaFiscal(integracao, idNota, session)
          const idsProdutosNota = notaTiny.nota.itens

          const versaoApi = integracao.configs.transferencias.versao_api

          let cnpjCliente
          let strIdProduto
          if (versaoApi === 'v2') {
            cnpjCliente = notaTiny.nota.cliente.cpf_cnpj
            strIdProduto = 'id_produto'

            if (notaTiny.nota.natureza_operacao === 'Devolução de mercadorias') {
              nota.status = 'devolucao_de_mercadoria'
              await nota.save()
              await session.commitTransaction()
              continue
            }
          } else if (versaoApi === 'v3') {
            cnpjCliente = notaTiny.nota.cliente.cpfCnpj
            strIdProduto = 'idProduto'

            if (notaTiny.nota.tipo === 'E') {
              nota.status = 'nota_entrada'
              await nota.save()
              await session.commitTransaction()
              continue
            }
          }

          const outrosCNPJS = [
            '37.677.337/0001-48',
            '37.677.337/0002-29',
            '37.677.337/0003-00',
            '37.677.337/0004-90',
            '37.677.337/0006-52',
            '37.677.337/0005-71',
          ].map((cnpj) => cnpj.replace(/\D/g, ''))

          const limparCNPJ = (cnpj) => cnpj.replace(/\D/g, '')

          if (outrosCNPJS.includes(limparCNPJ(cnpjCliente))) {
            nota.status = 'transferencia_entre_contas'
            await nota.save()
            await session.commitTransaction()
            continue
          }

          for (let produto of idsProdutosNota) {
            produto = produto.item ? produto.item : produto
            const notaMyApp = await Functions.findNotaFiscal(
              cnpj,
              produto.codigo,
              nota.dataEmissao,
              session,
            )

            if (!notaMyApp) {
              await Functions.criarNotaFiscal(integracao, produto, strIdProduto, session)

              await RandomFunctions.setLogs(Logs, {
                integration: integracao.name,
                integrationId: integracao._id,
                user: 'MyAppOne',
                userId: 'MyAppOne',
                action: 'criar_nf',
                message: 'Criou uma nova NF para receber itens',
              })
            } else {
              const itemEncontrado = notaMyApp.itens.find(
                (item) => item.codigo === produto.codigo,
              )

              if (itemEncontrado) {
                await NotaFiscal.updateOne(
                  { _id: notaMyApp._id, 'itens.codigo': produto.codigo },
                  { $inc: { 'itens.$.quantidade': produto.quantidade } },
                  { session },
                )

                await RandomFunctions.setLogs(Logs, {
                  integration: integracao.name,
                  integrationId: integracao._id,
                  user: 'MyAppOne',
                  userId: 'MyAppOne',
                  action: 'add_item',
                  message: 'Incrementou a quantidade de um produto em uma nota',
                  observacoes: [
                    {
                      codigo: produto.codigo,
                      descricao: produto.descricao,
                      quantidade: produto.quantidade,
                      notaId: notaMyApp._id,
                    },
                  ],
                })
              } else {
                const valorProduto = produto.valor_unitario
                  ? produto.valor_unitario
                  : produto.valorUnitario

                const novoItem = {
                  codigo: produto.codigo,
                  descricao: produto.descricao,
                  unidade: produto.unidade,
                  quantidade: produto.quantidade,
                  valor_unitario: Number.parseFloat(valorProduto),
                  idTiny: String(produto[strIdProduto]),
                  transferido: false,
                }
                await NotaFiscal.updateOne(
                  { _id: notaMyApp._id },
                  {
                    $push: {
                      itens: {
                        ...novoItem,
                      },
                    },
                  },
                  { session },
                )

                await RandomFunctions.setLogs(Logs, {
                  integration: integracao.name,
                  integrationId: integracao._id,
                  user: 'MyAppOne',
                  userId: 'MyAppOne',
                  action: 'add_item',
                  message: 'Adicionou um produto à uma NF de transferência',
                  observacoes: [
                    {
                      codigo: produto.codigo,
                      descricao: produto.descricao,
                      unidade: produto.unidade,
                      quantidade: produto.quantidade,
                      valor_unitario: valorProduto,
                      idTiny: produto[strIdProduto],
                    },
                  ],
                })
              }
            }
          }

          nota.status = 'processada'
          await nota.save()
          await session.commitTransaction()
        } catch (error) {
          await session.abortTransaction()

          nota.status = 'error'
          await nota.save()
        } finally {
          session.endSession()
        }

        const endIterationTime = Date.now()
        const iterationDuration = endIterationTime - startIterationTime

        const timeSpent = iterationDuration
        const remainingTime = delayBetweenIterations - timeSpent

        if (remainingTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingTime))
        }

        lastExecutionTime = Date.now()
      }
    } catch (error) {}

    return
  }
}

class Functions {
  static async findNotaFiscal(cnpjInformado, codigoItem, dataEmissao, session) {
    try {
      const inicioDoDia = new Date(dataEmissao)
      inicioDoDia.setUTCHours(0, 0, 0, 0)

      const fimDoDia = new Date(dataEmissao)
      fimDoDia.setUTCHours(23, 59, 59, 999)

      const notasFiscais = await NotaFiscal.find({
        cnpjIntegracao: cnpjInformado,
        status: 'aberto',
        dataNota: { $gte: inicioDoDia, $lt: fimDoDia },
      }).session(session)

      for (const nota of notasFiscais) {
        const itemEncontrado = nota.itens.some((item) => item.codigo === codigoItem)

        if (itemEncontrado) {
          return nota
        }
      }

      const notaComMenosItens = notasFiscais.find(
        (nota) => nota.itens.length < nota.qntItens,
      )

      return notaComMenosItens || null
    } catch (error) {
      return null
    }
  }

  static async getNotaFiscal(integracao, idNota, session) {
    try {
      const versaoApi = integracao.configs.transferencias.versao_api
      const tokenV2 = integracao.tokenApi_v2

      if (versaoApi === 'v2') {
        const nota = await axios.get(
          `https://api.tiny.com.br/api2/nota.fiscal.obter.php?token=${tokenV2}&id=${idNota}&formato=json`,
        )

        if (nota.status === 200 && nota.data.retorno.status === 'OK')
          return { api: 'v2', nota: nota.data.retorno.nota_fiscal }
      } else if (versaoApi === 'v3') {
        const access_token = await IntegrationFunctions.refreshTokenTiny(
          integracao.refresh_token,
          integracao._id,
          integracao.clientId,
          integracao.clientSecret,
          session,
        )

        const nota = await axios.get(
          `https://api.tiny.com.br/public-api/v3/notas/${idNota}`,
          {
            headers: { Authorization: `Bearer ${access_token.token}` },
          },
        )

        if (nota.status === 200) return { api: 'v3', nota: nota.data }
      }

      throw new Error('Erro ao obter a nota no Tiny')
    } catch (error) {
      throw new Error('Erro ao obter a nota no Tiny')
    }
  }

  static async criarNotaFiscal(integracao, item, strIdProduto, session) {
    const transferencias = integracao.configs.transferencias

    const valorProduto = item.valor_unitario ? item.valor_unitario : item.valorUnitario

    const dataNota = new Date()
    dataNota.setHours(0, 0, 0, 0)

    const novaNotaFiscal = new NotaFiscal({
      idIntegracao: integracao._id,
      cnpjIntegracao: integracao.cnpj,
      dataNota: dataNota,
      emissionHour: transferencias.emissionHour,
      qntItens: transferencias.qntItens,
      timeEmissao: null,
      status: 'aberto',
      tipo: 'S',
      natureza_operacao: 'Transferência de mercadoria adquirida ou recebida de terceiros',
      idTiny: null,
      numero: null,
      xml: null,
      chaveAcesso: null,
      idTinyDestino: null,
      numeroDestino: null,
      cliente: {
        natureza_operacao: transferencias.natureza_operacao,
        id_natureza_operacao: transferencias.id_natureza_operacao,
        codigo: transferencias.codigo,
        nome: transferencias.nameConta,
        tipoPessoa: transferencias.tipoPessoa,
        contribuinte: 1,
        cnpj: transferencias.cnpjConta,
        ie: transferencias.inscricao,
        cep: transferencias.cep,
        municipio: transferencias.municipio,
        uf: transferencias.estado,
        endereco: transferencias.endereco,
        bairro: transferencias.bairro,
        enderecoNro: transferencias.enderecoNro,
        complemento: transferencias.complemento,
        fone: transferencias.telefone,
        email: transferencias.email,
      },
      itens: [
        {
          codigo: item.codigo,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valor_unitario: Number.parseFloat(valorProduto),
          idTiny: String(item[strIdProduto]),
          transferido: false,
        },
      ],
      forma_pagamento: '0',
      parcelas: [
        {
          data: '13/09/2029',
          valor: '0',
        },
      ],
      frete_por_conta: 'R',
      valor_frete: '0',
      permissoes: {
        incluirNota: transferencias.incluirNota,
        emitirNota: transferencias.emitirNota,
        importarNota: transferencias.importarNota,
        lancarEstoque: transferencias.lancarEstoque,
      },
    })

    const resultado = await novaNotaFiscal.save({ session })
  }
}

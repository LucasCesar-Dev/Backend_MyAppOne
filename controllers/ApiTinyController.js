// Imports de pacotes nativos do Node.js
const fsSync = require('node:fs').promises
const URLSearchParams = require('node:url').URLSearchParams

// Imports de bibliotecas externas
const axios = require('axios')
const mongoose = require('mongoose')
const { PrismaClient, Prisma } = require('@prisma/client')
const moment = require('moment')

// Imports de arquivos locais
const IntegracaoTiny = require('../models/IntegracaoTiny')
const IntegrationFunctions = require('../utils/IntegrationFunctions')
const NotaFiscal = require('../models/NotasTiny')
const RandomFunctions = require('../utils/RandomFunctions')
const Logs = require('../models/Logs')

const prisma = new PrismaClient()

class ApiTinyController {
  static async getNewIntegration(req, res) {
    const { name, cnpj, clientId, clientSecret } = req.body

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      if (!name) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'without_name',
          message: ['Por favor escolha um nome para a sua integração !'],
        })
        await session.abortTransaction()
        return
      }

      let integrationExists = await IntegracaoTiny.findOne({
        name: name,
      }).session(session)

      if (integrationExists) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'duplicated_name',
          message: ['Já existe uma integração com esse nome'],
        })
        await session.abortTransaction()
        return
      }

      integrationExists = await IntegracaoTiny.findOne({
        cnpj: cnpj,
        clientId: clientId,
        clientSecret: clientSecret,
      }).session(session)

      if (integrationExists) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'duplicated_integration',
          message: [
            'Já existe uma integração com esse CNPJ ou Client ID ou Client Secret',
          ],
        })
        await session.abortTransaction()
        return
      }

      const newIntegration = await IntegracaoTiny.create(
        [
          {
            name: name,
            status: 'wait_auth',
            short_name: `temporario-tiny-${name.trim().replace(' ', '')}`,
            cnpj: cnpj,
            clientId: clientId,
            clientSecret: clientSecret,
            order: 1000,
          },
        ],
        {
          session,
        },
      )

      const newIntegrationId = newIntegration[0]._id.toString()

      await session.commitTransaction()
      session.endSession()

      const url = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${process.env.REDIRECT_URI_TINY}&scope=openid&response_type=code&state=${newIntegrationId}`

      res.status(201).json({ url: url })
    } catch (error) {
      await session.abortTransaction()
      session.endSession()

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter o link de autenticação. Por favor tente novamente em alguns minutos.',
        ],
      })
    } finally {
      session.endSession()
    }
  }

  static async changeCodeByToken(req, res) {
    const { code, state } = req.body

    try {
      const url = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token'

      const exists = await IntegracaoTiny.findOne({ _id: state })

      if (exists && exists.status !== 'wait_auth') {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: ['Já existe uma integração ativa com essa conta!'],
        })
        return
      }

      const data = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: exists.clientId,
        client_secret: exists.clientSecret,
        code: code,
        redirect_uri: process.env.REDIRECT_URI_TINY,
      })

      const response = await axios.post(url, data.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const retorno = response.data

      await IntegracaoTiny.updateOne(
        { _id: state },
        {
          $set: {
            status: 'await_configure',
            refresh_token: retorno.refresh_token,
            code: code,
            seller_id: retorno.user_id,
          },
        },
      )

      const path = './timers/tiny/refresh_token/config.json'
      const datajson = await fsSync.readFile(path, 'utf8')
      const jsonData = JSON.parse(datajson)
      jsonData.integracoes.push(state)
      await fsSync.writeFile(path, JSON.stringify(jsonData, null, 2), 'utf8')

      const pathCompras = './timers/tiny/compras/config.json'
      const datajsonCompras = await fsSync.readFile(pathCompras, 'utf8')
      const jsonDataCompras = JSON.parse(datajsonCompras)
      jsonDataCompras.push({
        idIntegracao: state,
        timerActive: false,
        horarios: [],
      })
      await fsSync.writeFile(
        pathCompras,
        JSON.stringify(jsonDataCompras, null, 2),
        'utf8',
      )

      res.status(201).json({ message: 'Integração realizada com sucesso!' })
    } catch (error) {
      console.log('error: ', error)

      try {
        const deletado = await IntegracaoTiny.findOne({ _id: state })

        if (deletado && deletado.status === 'wait_auth') {
          await IntegracaoTiny.deleteOne({ _id: state })
        }
      } catch (e) {}

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter o link de autenticação. Por favor, tente novamente em alguns minutos.',
          'A tentativa de integração foi cancelada, e você pode tentar novamente.',
        ],
      })
    }
  }

  static async concluirIntegration(req, res) {
    try {
      const { id } = req.body

      const integration = await IntegracaoTiny.findOne({
        _id: id,
      })

      if (!integration) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id !'],
        })
        return
      }

      if (integration.status !== 'wait_auth') {
        res.status(501).json({
          erroCode: '501',
          erroType: 'have_integration',
          message: ['Essa integração já foi concluida !'],
        })
        return
      }

      const newIntegrationId = integration._id.toString()

      const url = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?client_id=${integration.clientId}&redirect_uri=${process.env.REDIRECT_URI_TINY}&scope=openid&response_type=code&state=${newIntegrationId}`
      res.status(201).json({ url: url })
    } catch (error) {
      console.log('error: ', error)
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Não foi possível concluir a ação, tente novamente em alguns minutos !',
        ],
      })
    }
  }

  static async excluirIntegracao(req, res) {
    const { id } = req.body

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const integracao = await IntegracaoTiny.findOne({ _id: id }).session(session)

      if (!integracao) {
        await session.abortTransaction()
        session.endSession()
        return res.status(501).json({
          erroCode: '501',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id!'],
        })
      }

      if (integracao.status === 'wait_auth') {
        await IntegracaoTiny.deleteOne({ _id: id }).session(session)
        await session.commitTransaction()
        session.endSession()

        const path = './timers/tiny/refresh_token/config.json'
        const datajson = await fsSync.readFile(path, 'utf8')
        const jsonData = JSON.parse(datajson)
        jsonData.integracoes = jsonData.integracoes.filter((item) => item !== id)
        await fsSync.writeFile(path, JSON.stringify(jsonData, null, 2), 'utf8')

        return res.status(201).json({ message: 'Integração excluída com sucesso!' })
      }

      await IntegracaoTiny.deleteOne({ _id: id }).session(session)

      const path = './timers/tiny/refresh_token/config.json'
      const datajson = await fsSync.readFile(path, 'utf8')
      const jsonData = JSON.parse(datajson)
      jsonData.integracoes = jsonData.integracoes.filter((item) => item !== id)
      await fsSync.writeFile(path, JSON.stringify(jsonData, null, 2), 'utf8')

      const pathCompras = './timers/tiny/compras/config.json'
      const datajsonCompras = await fsSync.readFile(pathCompras, 'utf8')
      let jsonDataCompras = JSON.parse(datajsonCompras)
      jsonDataCompras = jsonDataCompras.filter((item) => item.idIntegracao !== id)
      await fsSync.writeFile(
        pathCompras,
        JSON.stringify(jsonDataCompras, null, 2),
        'utf8',
      )

      await session.commitTransaction()
      session.endSession()
      return res.status(201).json({ message: 'Integração excluída com sucesso!' })
    } catch (error) {
      await session.abortTransaction()
      session.endSession()
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: ['Ocorreu um erro ao tentar excluir a integração.'],
      })
    }
  }

  static async functionsOffIntegration(req, res) {
    try {
      const { action, id } = req.body

      if (action === 'ativar') {
        await IntegracaoTiny.updateOne(
          { _id: id },
          {
            $set: {
              status: 'active',
            },
          },
        )
      }

      if (action === 'pausar') {
        await IntegracaoTiny.updateOne(
          { _id: id },
          {
            $set: {
              status: 'paused',
            },
          },
        )
      }

      const pathCompras = './timers/tiny/compras/config.json'
      const datajsonCompras = await fsSync.readFile(pathCompras, 'utf8')
      let jsonDataCompras = JSON.parse(datajsonCompras)

      jsonDataCompras = jsonDataCompras.map((item) => {
        if (item.idIntegracao === id) {
          return {
            ...item,
            timerActive: action === 'ativar',
          }
        }
        return item
      })

      await fsSync.writeFile(
        pathCompras,
        JSON.stringify(jsonDataCompras, null, 2),
        'utf8',
      )

      res.status(201).json({ message: 'ação concluida com sucesso !' })
    } catch (error) {
      console.log(error)

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Não foi possível concluir a ação, tente novamente em alguns minutos !',
        ],
      })
    }
  }

  static async getIntegrationById(req, res) {
    const { id, int } = req.query

    try {
      let integration

      if (int === 'ml') {
        integration = await IntegracaoML.findOne({ _id: id }).select(
          '-code -refresh_token -seller_id -lastAccess_token',
        )
      }

      if (int === 'gs') {
        integration = await IntegracaoGS.findOne({ _id: id }).select('-code')
      }

      if (int === 'mgl') {
        integration = await IntegracaoMGL.findOne({ _id: id }).select(
          '-code -refresh_token -seller_id -lastAccess_token',
        )
      }

      if (!integration) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id !'],
        })
        return
      }

      res.status(201).json(integration.toObject())
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar obter as informações dessa integração. Por favor tente novamente!',
        ],
      })
    }
  }

  static async updateIntegration(req, res) {
    const { id, updated } = req.body

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const original = await IntegracaoTiny.findById(id).session(session)

      if (!original) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id!'],
        })
      }

      const shortExists = await IntegracaoTiny.findOne({
        short_name: updated.short_name,
      })

      if (
        shortExists &&
        shortExists._id.toString() !== original.toObject()._id.toString()
      ) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'short_name_exists',
          message: ['Esse nick já existe no sistema, por favor escolha outro.'],
        })
      }

      const updatedData = IntegrationFunctions.mapToSchemaTinyFormat(updated)
      const changes = IntegrationFunctions.detectEditableChangesTiny(
        original.toObject(),
        updatedData,
      )

      changes.status = 'active'

      if (Object.keys(changes).length > 0) {
        await IntegracaoTiny.updateOne({ _id: id }, { $set: changes }, { session })
      }

      await session.commitTransaction()
      session.endSession()

      const pathCompras = './timers/tiny/compras/config.json'
      const datajsonCompras = await fsSync.readFile(pathCompras, 'utf8')
      let jsonDataCompras = JSON.parse(datajsonCompras)

      const horarios = gerarHorarios(changes.configs.compras.timerCompras)

      jsonDataCompras = jsonDataCompras.map((item) => {
        if (item.idIntegracao === id) {
          return {
            ...item,
            horarios: horarios,
            ...(original.toObject().status === 'await_configure'
              ? { timerActive: true }
              : {}),
          }
        }
        return item
      })

      await fsSync.writeFile(
        pathCompras,
        JSON.stringify(jsonDataCompras, null, 2),
        'utf8',
      )

      res.status(201).json({ message: 'Integração atualizada com sucesso !' })
    } catch (error) {
      console.log('error: ', error)
      await session.abortTransaction()
      session.endSession()
      res.status(500).json({
        erroCode: '500',
        erroType: 'update_error',
        message: ['Ocorreu um erro ao tentar atualizar a integração.'],
      })
    }
  }

  static async getComprasWithParams(req, res) {
    const { produto, ultimaCompra } = req.query

    const produtoFinal = await prisma.produtos.findUnique({
      where: {
        sku: produto,
      },

      include: {
        Desmembramento: true,
      },
    })

    if (!produtoFinal) {
      res
        .status(404)
        .json({
          message: 'Produto não cadastrado no banco de dados',
        })
        .end()

      return
    }

    const compras = await prisma.produtosOnCompras.findMany({
      where: {
        produtoId: produtoFinal.id,
      },
      include: {
        compra: {
          include: {
            fornecedor: true,
          },
        },
      },
      ...(ultimaCompra === 'true'
        ? {
            orderBy: {
              compra: {
                dataEmissao: 'desc',
              },
            },
            take: 1,
          }
        : {}),
    })

    const dataHoje = new Date()
    let dataInicial
    let range_datas

    if (ultimaCompra === 'true') {
      dataInicial = compras[0].compra.dataEmissao
      range_datas =
        'Data de vendas baseada na data da ultima compra desse produto até hoje'
    } else {
      dataInicial =
        compras[compras.length - 1]?.compra?.dataEmissao || new Date('2024-07-18')
      range_datas = compras[compras.length - 1]?.compra?.dataEmissao
        ? 'Data de vendas baseada na data da primeira compra desse produto até hoje'
        : 'Data de vendas entre 18/07/2024 até hoje. Esse produto não possui compras.'
    }

    const quantidadeVendida = await ApiTinyController.getQuantidadeProdutosVendidos(
      produtoFinal.id,
      dataInicial,
      dataHoje,
    )

    const result = compras
      .map((item) => ({ quantity: item.quantity, valorTotal: item.valorTotal }))
      .reduce(
        (acc, curr) => {
          acc.quantity += curr.quantity
          acc.valorTotal += curr.valorTotal
          return acc
        },
        { quantity: 0, valorTotal: 0 },
      )

    let quantidadeReal = 0

    compras.map((compra, index) => {
      if (ultimaCompra === 'true' && index === 0) {
        quantidadeReal += compra.quantity

        return {
          contaTiny: compra.compra.cnpjTiny,
          idNota: compra.compra.idNota,
          numeroNota: compra.compra.numeroNota,
          fornecedor: compra.compra.fornecedor.nome,
          cnpj: compra.compra.fornecedor.cpfCnpj,
          dataEmissao: formatDate(compra.compra.dataEmissao),
          dataEntrada: formatDate(compra.compra.dataEntrada),
          quantidade: compra.quantity,
          valorUnitario: compra.valor,
          valorTotal: compra.valorTotal,
          linkNota: `${process.env.API_USO}/api/api-tiny/getcomprasdetalhes?idNota=${compra.compra.idNota}`,
        }
      }
      if (ultimaCompra === 'false') {
        quantidadeReal += compra.quantity
        return {
          contaTiny: compra.compra.cnpjTiny,
          idNota: compra.compra.idNota,
          numeroNota: compra.compra.numeroNota,
          fornecedor: compra.compra.fornecedor.nome,
          cnpj: compra.compra.fornecedor.cpfCnpj,
          dataEmissao: formatDate(compra.compra.dataEmissao),
          dataEntrada: formatDate(compra.compra.dataEntrada),
          quantidade: compra.quantity,
          valorUnitario: compra.valor,
          valorTotal: compra.valorTotal,
          linkNota: `${process.env.API_USO}/api/api-tiny/getcomprasdetalhes?idNota=${compra.compra.idNota}`,
        }
      }
    })

    const data = new Date(dataInicial)

    const dia = String(data.getDate()).padStart(2, '0')
    const mes = String(data.getMonth() + 1).padStart(2, '0')
    const ano = data.getFullYear()

    const dataFormatada = `${dia}/${mes}/${ano}`

    res.status(201).json({
      produto: produtoFinal.name,
      sku: produtoFinal.sku,
      quantidade: quantidadeReal,
      valorTotal: result.valorTotal,
      quantidadeVendida: quantidadeVendida,

      periodo_de_vendas: range_datas,

      compras: compras.map((compra, index) => {
        if (ultimaCompra === 'true' && index === 0) {
          return {
            contaTiny: compra.compra.cnpjTiny,
            idNota: compra.compra.idNota,
            numeroNota: compra.compra.numeroNota,
            fornecedor: compra.compra.fornecedor.nome,
            cnpj: compra.compra.fornecedor.cpfCnpj,
            dataEmissao: formatDate(compra.compra.dataEmissao),
            dataEntrada: formatDate(compra.compra.dataEntrada),
            quantidade: compra.quantity,
            valorUnitario: compra.valor,
            valorTotal: compra.valorTotal,
            linkNota: `${process.env.API_USO}/api/api-tiny/getcomprasdetalhes?idNota=${compra.compra.idNota}`,
          }
        }
        if (ultimaCompra === 'false') {
          return {
            contaTiny: compra.compra.cnpjTiny,
            idNota: compra.compra.idNota,
            numeroNota: compra.compra.numeroNota,
            fornecedor: compra.compra.fornecedor.nome,
            cnpj: compra.compra.fornecedor.cpfCnpj,
            dataEmissao: formatDate(compra.compra.dataEmissao),
            dataEntrada: formatDate(compra.compra.dataEntrada),
            quantidade: compra.quantity,
            valorUnitario: compra.valor,
            valorTotal: compra.valorTotal,
            linkNota: `${process.env.API_USO}/api/api-tiny/getcomprasdetalhes?idNota=${compra.compra.idNota}`,
          }
        }
      }),

      desmembramento: produtoFinal.Desmembramento,
    })
  }

  static async getComprasDetalhes(req, res) {
    const { idNota } = req.query

    const compras = await prisma.compras.findUnique({
      where: {
        idNota: Number.parseInt(idNota),
      },
      include: {
        fornecedor: true,
        ProdutosOnCompras: {
          include: {
            produto: true,
          },
        },
        ProdutosNovos: true,
      },
    })

    res.status(201).json({
      idNota: compras.idNota,
      cnpjTiny: compras.cnpjTiny,
      numeroNota: compras.numeroNota,
      dataEmissao: formatDate(compras.dataEmissao),
      dataEntrada: formatDate(compras.dataEntrada),
      fornecedor: compras.fornecedor.nome,
      cnpjFornecedor: compras.fornecedor.cpfCnpj,

      itens: compras.ProdutosOnCompras.map((produto) => {
        return {
          produto: produto.produto.name,
          sku: produto.produto.sku,
          ean: produto.produto.gtin,
          quantidade: produto.quantity,
          valor: produto.valor,
          valorTotal: produto.valorTotal,
        }
      }),

      ...(compras.ProdutosNovos ? { produtosNovos: compras.ProdutosNovos } : {}),
    })
  }

  static async getFornecedoresLimit(req, res) {
    try {
      const value = req.body.value
      const id = req.body.id

      if (id) {
        const totalProdutos = await prisma.fornecedores.findUnique({
          where: {
            id: Number.parseInt(id),
          },
          select: {
            nome: true,
            id: true,
            cpfCnpj: true,
          },
        })

        res.status(201).json(totalProdutos)
        return
      }

      const palavras = value
        .toLowerCase()
        .split(/\s+/)
        .filter((palavra) => palavra.length >= 2)

      const whereCondition = {
        AND: palavras.map((palavra) => ({
          OR: [{ cpfCnpj: { contains: palavra } }, { nome: { contains: palavra } }],
        })),
      }

      const totalProdutos = await prisma.fornecedores.findMany({
        where: whereCondition,
        take: 15,
        select: {
          nome: true,
          id: true,
          cpfCnpj: true,
        },
      })

      const produtosOrdenados = totalProdutos
        .map((produto) => ({
          ...produto,
          similaridade: calcularSimilaridade(produto, value),
          cpfCnpj: formatarCnpjCpf(produto.cpfCnpj),
        }))
        .sort((a, b) => b.similaridade - a.similaridade)
        .slice(0, 15)

      res.status(201).json(produtosOrdenados)
    } catch (error) {
      console.log('error: ', error)

      res.status(500).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: [
          'Ocorreu um erro ao tentar obter a lista de fornecedores para a sugestão. Por favor recarregue a página.',
        ],
      })
    }
  }

  static async getQuantidadeProdutosVendidos(produtoId, dataInicio, dataFim) {
    const resultado = await prisma.produtosOnVendas.aggregate({
      _sum: {
        quantity: true,
      },
      where: {
        produtoId: produtoId,
        venda: {
          dataEmissao: {
            gte: dataInicio,
            lte: dataFim,
          },
        },
      },
    })

    return resultado._sum.quantity || 0
  }

  static async editarComprasAntigas(compras, novoDesmembramento, skuProduto) {
    await IntegrationFunctions.getNewTokensTiny()

    for (const compra of compras) {
      const integracao = await IntegracaoTiny.findOne({ _id: compra.compra.idIntegracao })
      const token = integracao.lastAccess_token.token

      const notaDetalhes = await EstoqueController.getNotaDetalhes(
        compra.compra.idNota,
        token,
      )

      const cpfCnpj = notaDetalhes.cliente.cpfCnpj.replace(/\D/g, '')

      const produtoEditavel = notaDetalhes.itens.find(
        (item) => item.codigo === skuProduto,
      )

      await EstoqueController.editarProdutoOnCompras(
        produtoEditavel,
        novoDesmembramento,
        compra.id,
        cpfCnpj,
      )
    }
  }

  static async editarComprasProdutosNovos(
    compras,
    novoDesmembramento,
    skuProduto,
    idTiny,
  ) {
    await IntegrationFunctions.getNewTokensTiny()

    for (const compra of compras) {
      const integracao = await IntegracaoTiny.findOne({ _id: compra.compra.idIntegracao })
      const token = integracao.lastAccess_token.token

      const notaDetalhes = await EstoqueController.getNotaDetalhes(
        compra.compra.idNota,
        token,
      )

      const cpfCnpj = notaDetalhes.cliente.cpfCnpj.replace(/\D/g, '')

      const produtos = await prisma.produtos.findMany({
        where: {
          OR: [{ tinyId: idTiny }, { sku: skuProduto }],
        },
        include: { Desmembramento: true },
      })

      const produtosNovos = []
      let produtosCreate = EstoqueController.criarProdutosOnCompras(
        [notaDetalhes.itens.find((item) => item.codigo === skuProduto)],
        produtos,
        produtosNovos,
        cpfCnpj,
      )

      produtosCreate = produtosCreate.map((item) => ({
        ...item,
        compraId: compra.compraId,
      }))

      await prisma.produtosOnCompras.createMany({
        data: produtosCreate,
      })

      await prisma.produtosNovos.delete({
        where: {
          id: compra.id,
        },
      })
    }
  }

  static async editarComprasSemProdutos(compras, skuProduto, idTiny) {
    await IntegrationFunctions.getNewTokensTiny()

    for (const compra of compras) {
      const integracao = await IntegracaoTiny.findOne({ _id: compra.compra.idIntegracao })
      const token = integracao.lastAccess_token.token

      const notaDetalhes = await EstoqueController.getNotaDetalhes(
        compra.compra.idNota,
        token,
      )

      const cpfCnpj = notaDetalhes.cliente.cpfCnpj.replace(/\D/g, '')

      const produtos = await prisma.produtos.findMany({
        where: {
          OR: [{ tinyId: idTiny }, { sku: skuProduto }],
        },
        include: { Desmembramento: true },
      })

      let produtosNovos = []
      const produtosCreate = EstoqueController.criarProdutosOnCompras(
        [notaDetalhes.itens.find((item) => item.codigo === skuProduto)],
        produtos,
        produtosNovos,
        cpfCnpj,
      )

      produtosNovos = produtosNovos.map((item) => ({
        ...item,
        compraId: compra.compraId,
      }))

      await prisma.produtosNovos.createMany({
        data: produtosNovos,
      })
    }
  }

  static async getAllIntegrationTiny(req, res) {
    try {
      const id = req.query.id

      const integrations = await IntegracaoTiny.find().sort({ order: 1 })

      const response = integrations.filter((item) => item.id !== id)

      const rightIntegrations = []
      for (const int of response) {
        if (int.configs?.transferencias?.permitirOrigem) {
          rightIntegrations.push({
            name: int.name,
            cnpj: int.cnpj,
            id: int.id,
          })
        }
      }

      res.status(201).json(rightIntegrations)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: ['Não foi possível obter a integrações disponíveis no Tiny'],
      })
    }
  }

  static async getDadosClienteTiny(req, res) {
    try {
      const idCliente = req.body.idCliente
      const idOrigem = req.body.idOrigem

      const cliente = await IntegracaoTiny.findById(idCliente)
      const origem = await IntegracaoTiny.findById(idOrigem)

      if (!origem.tokenApi_v2 || origem.tokenApi_v2 === '') {
        res.status(501).json({
          erroCode: '501',
          erroType: 'without_token',
          message: [
            'A integração de origem não tem o Token Api V2 do Tiny configurado no aplicativo. Por favor configure e tente novamente',
          ],
        })

        return
      }

      const cpfCliente = cliente.cnpj
      const tokenOrigem = origem.tokenApi_v2

      const response = await axios.get(
        `https://api.tiny.com.br/api2/contatos.pesquisa.php?token=${tokenOrigem}&cpf_cnpj=${cpfCliente}&formato=json`,
      )

      if (response.status !== 200 || response.data.retorno.status !== 'OK') {
        res.status(501).json({
          erroCode: '501',
          erroType: 'tiny_error',
          message: [
            'Ocorreu um erro ao tentar obter o contato no Tiny. Por favor tente novamente mais tarde.',
          ],
        })
        return
      }

      const contatoTiny = response.data.retorno.contatos[0].contato

      try {
        const responseContato = await axios.get(
          `https://api.tiny.com.br/api2/contato.obter.php?token=${tokenOrigem}&id=${contatoTiny.id}&formato=JSON`,
        )

        if (
          responseContato.status === 200 &&
          responseContato.data.retorno.status === 'OK' &&
          responseContato?.data?.retorno?.contato?.ie
        ) {
          res
            .status(201)
            .json({ ...contatoTiny, inscricao: responseContato.data.retorno.contato.ie })
          return
        }

        throw new Error()
      } catch (err) {
        res.status(201).json({ ...contatoTiny, inscricao: '' })
      }
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: ['Não foi possível obter as informações no Tiny.'],
      })
    }
  }

  static async getDadosContaTiny(req, res) {
    try {
      const idTiny = req.body.idTiny

      if (!idTiny) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'without_token',
          message: ['O token da api v2 não está devidamente configurado nessa conta.'],
        })

        return
      }

      const response = await axios.get(
        `https://api.tiny.com.br/api2/info.php?token=${idTiny}&formato=JSON`,
      )

      if (response.status !== 200 || response.data.retorno.status !== 'OK') {
        res.status(501).json({
          erroCode: '501',
          erroType: 'tiny_error',
          message: [
            'Ocorreu um erro ao tentar obter as informações da conta no Tiny. Por favor tente novamente mais tarde.',
          ],
        })
        return
      }

      res.status(201).json(response.data.retorno.conta)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: ['Não foi possível obter as informações no Tiny.'],
      })
    }
  }

  static async incluirNotaFiscal(idNotaEmitir) {
    const nota = await NotaFiscal.findById(idNotaEmitir)

    try {
      const cliente = {
        codigo: nota.cliente.codigo,
        nome: nota.cliente.nome,
        tipoPessoa: nota.cliente.tipoPessoa,
        contribuinte: nota.cliente.contribuinte,
        cpf_cnpj: nota.cliente.cnpj,
        ie: nota.cliente.ie,
        cep: nota.cliente.cep,
        cidade: nota.cliente.municipio,
        uf: nota.cliente.uf,
        endereco: nota.cliente.endereco,
        bairro: nota.cliente.bairro,
        numero: nota.cliente.enderecoNro,
        complemento: nota.cliente.complemento,
        fone: nota.cliente.fone,
        email: nota.cliente.email,
        atualizar_cliente: 'N',
      }

      const itens = nota.itens
        .map((item) => {
          if (item.idTiny && item.idTiny !== '' && item.idTiny !== '0') {
            return {
              item: {
                codigo: String(item.codigo),
                descricao: item.descricao,
                unidade: item.unidade,
                quantidade: Number.parseFloat(item.quantidade),
                valor_unitario: Number.parseFloat(item.valor_unitario).toFixed(2),
              },
            }
          }
        })
        .filter(Boolean)

      const notaFiscal = {
        nota_fiscal: {
          tipo: 'S',
          natureza_operacao:
            'Transferência de mercadoria adquirida ou recebida de terceiros',
          data_emissao: String(moment().format('DD/MM/YYYY')),
          data_entrada_saida: moment().format('DD/MM/YYYY'),
          hora_entrada_saida: moment().format('HH:mm'),
          cliente,
          itens,
          forma_pagamento: null,
          frete_por_conta: 'R',
          valor_frete: '0',
          marcadores: [
            {
              marcador: {
                descricao: 'Nota de Transf. MyAppOne',
              },
            },
          ],
        },
      }

      const integracao = await IntegracaoTiny.findById(nota.idIntegracao)

      if (integracao.configs.transferencias.incluirNota) {
        const intTransf = integracao.configs.transferencias
        const tokenDestino = integracao.tokenApi_v2
        const origem = await IntegracaoTiny.findById(intTransf.integrationOrigem)

        const url = 'https://api.tiny.com.br/api2/nota.fiscal.incluir.php'
        const token = origem.tokenApi_v2

        console.log('incluindo')
        const response = await axios.post(
          url,
          new URLSearchParams({
            token: token,
            nota: JSON.stringify(notaFiscal),
            formato: 'JSON',
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        )

        console.log('terminou')
        console.log()

        if (response.status === 200 && response.data.retorno.status === 'OK') {
          nota.itens.forEach((item) => {
            if (item.idTiny && item.idTiny !== '' && item.idTiny !== '0') {
              item.transferido = true
            }
          })
          await nota.save()

          const date = new Date(nota.dataNota)
          const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`

          await RandomFunctions.setLogs(Logs, {
            integration: integracao.name,
            integrationId: integracao._id,
            user: 'MyAppOne',
            userId: 'MyAppOne',
            action: 'incluir_nota',
            message: 'Incluiu uma NF de transferência na conta de origem',
            observacoes: [
              {
                notaId: nota._id,
                origem: origem.name,
                quantidadeItens: itens.length,
                dataHoraEmissao: `${notaFiscal.nota_fiscal.data_emissao} - ${notaFiscal.nota_fiscal.hora_entrada_saida}`,
                dataNota: formattedDate,
                idNotaTinyOrigem: response.data.retorno.registros.registro.id,
                numeroNotaTinyOrigem: response.data.retorno.registros.registro.numero,
              },
            ],
          })

          const idNotaTiny = response.data.retorno.registros.registro.id

          await NotaFiscal.updateOne(
            { _id: nota._id },
            {
              $set: {
                timeEmissao: new Date(),
                idTiny: idNotaTiny,
                numero: response.data.retorno.registros.registro.numero,
                status: 'incluido',
              },
            },
          )

          console.log('emitindo')
          let responseEmissao = false
          if (integracao.configs.transferencias.emitirNota) {
            responseEmissao = await ApiTinyController.emitirNotaFiscal(
              token,
              idNotaTiny,
              nota._id,
              integracao.name,
              integracao._id,
            )
          }
          console.log('terminou')
          console.log()

          console.log('importando')
          let responseImportacao = false
          if (integracao.configs.transferencias.importarNota && responseEmissao) {
            responseImportacao = await ApiTinyController.cirarOrdemCompra(
              nota,
              integracao,
              notaFiscal,
            )
          }
          console.log('terminou')
          console.log()

          console.log('lançando')
          let responseLancamento = false
          if (integracao.configs.transferencias.lancarEstoque && responseImportacao) {
            responseLancamento = await ApiTinyController.lancarEstoqueOrdemCompra(
              integracao,
              responseImportacao.id,
              responseImportacao.access_token,
              nota._id,
            )
          }
          console.log('terminou')
        } else {
          throw response
        }
      } else {
        await NotaFiscal.updateOne(
          { _id: nota._id },
          {
            $set: {
              status: 'nao_incluido',
            },
          },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: integracao.name,
          integrationId: integracao._id,
          user: 'MyAppOne',
          userId: 'MyAppOne',
          action: 'fechou_sem_emitir',
          message:
            'O MyAppOne encerrou essa nota fiscal sem fazer nenhum processo no Tiny',
          observacoes: [
            {
              notaId: nota._id,
            },
          ],
        })
      }
    } catch (error) {
      console.log('erro de inclusão: ', error)
      await NotaFiscal.updateOne(
        { _id: nota._id },
        {
          $set: {
            status: 'error_inclusao',
            error: (() => {
              try {
                return typeof error === 'object' && error !== null && 'data' in error
                  ? JSON.stringify(error.data)
                  : 'erro desconhecido'
              } catch (e) {
                return 'erro ao serializar error.data'
              }
            })(),
          },
        },
      )

      const integracao = await IntegracaoTiny.findById(nota.idIntegracao)

      await RandomFunctions.setLogs(Logs, {
        integration: integracao.name,
        integrationId: integracao._id,
        user: 'MyAppOne',
        userId: 'MyAppOne',
        action: 'erro_inclusao',
        message: 'Ocorreu um erro ao incluir a NF na conta de origem',
        observacoes: [
          {
            notaId: nota._id,
          },
        ],
      })
    }
  }

  static async emitirNotaFiscal(tokenOrigem, idNota, idMongo, nameInt, idInt) {
    try {
      const url = 'https://api.tiny.com.br/api2/nota.fiscal.emitir.php'

      const data = new URLSearchParams({
        token: tokenOrigem,
        id: idNota,
        formato: 'JSON',
      })

      const response = await axios.post(url, data.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      if (response.status === 200 && response.data.retorno.status === 'OK') {
        await NotaFiscal.updateOne(
          { _id: idMongo },
          {
            $set: {
              status: 'emitido',
              xml: response.data.retorno.nota_fiscal.xml,
              chaveAcesso: response.data.retorno.nota_fiscal.chave_acesso,
            },
          },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: nameInt,
          integrationId: idInt,
          user: 'MyAppOne',
          userId: 'MyAppOne',
          action: 'emitir_nota',
          message: 'Emitiu uma NF de transferência na conta de origem',
          observacoes: [
            {
              notaId: idMongo,
              idNotaTiny: idNota,
            },
          ],
        })

        return response.data
      }

      throw response
    } catch (error) {
      console.log('erro de emissão: ', JSON.stringify(error))

      await NotaFiscal.updateOne(
        { _id: idMongo },
        {
          $set: {
            status: 'error_emissao',
            error: (() => {
              try {
                return typeof error === 'object' && error !== null && 'data' in error
                  ? JSON.stringify(error.data)
                  : 'erro desconhecido na emissão'
              } catch (e) {
                return 'erro ao serializar error.data na emissão'
              }
            })(),
          },
        },
      )

      await RandomFunctions.setLogs(Logs, {
        integration: nameInt,
        integrationId: idInt,
        user: 'MyAppOne',
        userId: 'MyAppOne',
        action: 'erro_emissao',
        message: 'Ocorreu um erro ao emitir a NF na conta de origem',
        observacoes: [
          {
            notaId: idMongo,
          },
        ],
      })

      return false
    }
  }

  static async cirarOrdemCompra(nota, destino, notaFiscal) {
    try {
      const itens = nota.itens
        .map((item) => {
          if (item.idTiny && item.idTiny !== '' && item.idTiny !== '0') {
            return {
              produto: {
                id: Number.parseInt(item.idTiny),
              },
              quantidade: Number.parseFloat(item.quantidade),
              valor: Number.parseFloat(item.valor_unitario).toFixed(2),
            }
          }
        })
        .filter(Boolean)

      const access_token = await IntegrationFunctions.refreshTokenTiny(
        destino.refresh_token,
        destino._id,
        destino.clientId,
        destino.clientSecret,
      )

      const dataAtual = new Date().toISOString().split('T')[0]

      const body = {
        data: String(dataAtual),
        dataPrevista: String(dataAtual),
        desconto: 0,
        observacoesInternas: 'Transferência de estoque MyAppOne',
        contato: {
          id: Number.parseInt(destino.configs.transferencias.integrationTinyId),
        },
        categoria: {
          id: 0,
        },
        frete: 0,
        itens: itens,
      }

      const response = await axios.post(
        'https://api.tiny.com.br/public-api/v3/ordem-compra',
        body,
        {
          headers: {
            Authorization: `Bearer ${access_token.token}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (response.status === 200) {
        await NotaFiscal.updateOne(
          { _id: nota._id },
          {
            $set: {
              status: 'importado',
              idTinyDestino: response.data.id,
              numeroDestino: response.data.numeroPedido,
            },
          },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: destino.name,
          integrationId: destino._id,
          user: 'MyAppOne',
          userId: 'MyAppOne',
          action: 'importar_nota',
          message: 'Importou os itens como uma ordem de compra na conta de destino',
          observacoes: [
            {
              notaId: nota._id,
              quantidadeItens: itens.length,
              dataHoraImportacao: `${notaFiscal.nota_fiscal.data_emissao} - ${notaFiscal.nota_fiscal.hora_entrada_saida}`,
              idDestino: response.data.id,
              numeroDestino: response.data.numeroPedido,
            },
          ],
        })

        return { ...response.data, access_token: access_token.token }
      }
    } catch (error) {
      console.log('erro de importacao: ', JSON.stringify(error.response.data))

      await NotaFiscal.updateOne(
        { _id: nota._id },
        {
          $set: {
            status: 'erro_importacao',
            error: (() => {
              try {
                if (
                  error &&
                  typeof error === 'object' &&
                  error.response &&
                  error.response.data
                ) {
                  return JSON.stringify(error.response.data)
                }
                return 'erro desconhecido na importação'
              } catch (e) {
                return 'erro ao serializar error.response.data na importação'
              }
            })(),
          },
        },
      )

      await RandomFunctions.setLogs(Logs, {
        integration: destino.name,
        integrationId: destino._id,
        user: 'MyAppOne',
        userId: 'MyAppOne',
        action: 'erro_importacao',
        message: 'Ocorreu um erro ao importar a NF na conta de destino',
        observacoes: [
          {
            notaId: nota._id,
          },
        ],
      })

      return false
    }
  }

  static async lancarEstoqueOrdemCompra(destino, idOrdem, access_token, idMongo) {
    try {
      const response = await axios.post(
        `https://api.tiny.com.br/public-api/v3/ordem-compra/${idOrdem}/lancar-estoque`,
        {
          deposito: {
            id: Number.parseInt(destino.configs.transferencias.id_deposito),
          },
        },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (response.status === 204) {
        await NotaFiscal.updateOne(
          { _id: idMongo },
          {
            $set: {
              status: 'estoque_lancado',
            },
          },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: destino.name,
          integrationId: destino._id,
          user: 'MyAppOne',
          userId: 'MyAppOne',
          action: 'lancar_estoque',
          message:
            'Lançou estoque da NF de transferência na conta de destino por uma ordem de compra',
          observacoes: [
            {
              notaId: idMongo,
              error: 'Não ocorreram erros durante o processo de transferência',
            },
          ],
        })

        return true
      }
    } catch (error) {
      console.log('erro de lançamento: ', JSON.stringify(error.response.data))

      await NotaFiscal.updateOne(
        { _id: idMongo },
        {
          $set: {
            status: 'erro_lancamento',
            error: (() => {
              try {
                if (
                  error &&
                  typeof error === 'object' &&
                  error.response &&
                  error.response.data
                ) {
                  return JSON.stringify(error.response.data)
                }
                return 'erro desconhecido no lançamento'
              } catch (e) {
                return 'erro ao serializar error.response.data no lançamento'
              }
            })(),
          },
        },
      )

      await RandomFunctions.setLogs(Logs, {
        integration: destino.name,
        integrationId: destino._id,
        user: 'MyAppOne',
        userId: 'MyAppOne',
        action: 'erro_lancamento',
        message:
          'Ocorreu um erro ao lançar estoque na conta de destino pela ordem de compra',
        observacoes: [
          {
            notaId: idMongo,
          },
        ],
      })

      return false
    }
  }

  static async importarXML(tokenDestino, idMongo) {
    try {
      console.log('importando')

      const nota = await NotaFiscal.findById(idMongo)

      const url = 'https://api.tiny.com.br/api2/incluir.nota.xml.php'

      const data = new URLSearchParams({
        token: tokenDestino,
        xml: nota.xml,
        formato: 'JSON',
      })

      const response = await axios.post(url, data.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      console.log()
      console.log('response.status: ', response.status)
      console.log('response.data: ', JSON.stringify(response.data))
      console.log()

      if (response.status === 200 && response.data.retorno.status === 'OK') {
        await NotaFiscal.updateOne(
          { _id: idMongo },
          {
            $set: {
              status: 'importado',
              idDestino: response.data.retorno.idNotaFiscal,
            },
          },
        )

        return response.data
      }

      throw new Error('Erro ao importar nota fiscal')
    } catch (error) {
      console.log('erro de importacao: ', error)
      await NotaFiscal.updateOne(
        { _id: idMongo },
        {
          $set: {
            status: 'erro_importacao',
          },
        },
      )

      return false
    }
  }

  static async importarNotaFiscal(
    itens,
    origem,
    tokenDestino,
    idMongo,
    chaveAcesso,
    intName,
    intId,
    nota,
  ) {
    try {
      const cliente = {
        nome: origem.configs.transferencias.nameConta,
        tipoPessoa: origem.configs.transferencias.tipoPessoa,
        contribuinte: '1',
        cpf_cnpj: origem.configs.transferencias.cnpjConta,
        ie: origem.configs.transferencias.inscricao,
        cep: origem.configs.transferencias.cep,
        cidade: origem.configs.transferencias.municipio,
        uf: origem.configs.transferencias.estado,
        endereco: origem.configs.transferencias.endereco,
        bairro: origem.configs.transferencias.bairro,
        numero: origem.configs.transferencias.enderecoNro,
        complemento: origem.configs.transferencias.complemento,
        fone: origem.configs.transferencias.telefone,
        email: origem.configs.transferencias.email,
        atualizar_cliente: 'N',
      }

      const notaFiscal = {
        nota_fiscal: {
          id_natureza_operacao: nota.cliente.id_natureza_operacao,
          natureza_operacao: nota.cliente.natureza_operacao,
          tipo: 'E',
          finalidade: 9,
          refNFe: chaveAcesso,
          data_emissao: moment().format('DD/MM/YYYY'),
          data_entrada_saida: moment().format('DD/MM/YYYY'),
          hora_entrada_saida: moment().format('HH:mm'),
          cliente,
          itens,
          forma_pagamento: null,
          frete_por_conta: 'R',
          valor_frete: '0',
          marcadores: [
            {
              marcador: {
                descricao: 'Nota de Transf. MyAppOne',
              },
            },
          ],
        },
      }

      const url = 'https://api.tiny.com.br/api2/nota.fiscal.incluir.php'

      const response = await axios.post(
        url,
        new URLSearchParams({
          token: tokenDestino,
          nota: JSON.stringify(notaFiscal),
          formato: 'JSON',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )

      if (response.status === 200 && response.data.retorno.status === 'OK') {
        await NotaFiscal.updateOne(
          { _id: idMongo },
          {
            $set: {
              status: 'importado',
              idDestino: response.data.retorno.registros.registro.id,
              numeroDestino: response.data.retorno.registros.registro.numero,
            },
          },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: intName,
          integrationId: intId,
          user: 'MyAppOne',
          userId: 'MyAppOne',
          action: 'importar_nota',
          message: 'Importou uma NF de transferência para a conta de destino',
          observacoes: [
            {
              notaId: idMongo,
              quantidadeItens: itens.length,
              dataHoraImportacao: `${notaFiscal.nota_fiscal.data_emissao} - ${notaFiscal.nota_fiscal.hora_entrada_saida}`,
              idDestino: response.data.retorno.registros.registro.id,
              numeroDestino: response.data.retorno.registros.registro.numero,
            },
          ],
        })

        return response.data
      }

      throw new Error(`Erro ao importar nota fiscal - ${response.data}`)
    } catch (error) {
      console.log('erro de importacao: ', error)
      await NotaFiscal.updateOne(
        { _id: idMongo },
        {
          $set: {
            status: 'erro_importacao',
          },
        },
      )

      await RandomFunctions.setLogs(Logs, {
        integration: intName,
        integrationId: intId,
        user: 'MyAppOne',
        userId: 'MyAppOne',
        action: 'erro_importacao',
        message: 'Ocorreu um erro ao importar a NF na conta de destino',
        observacoes: [
          {
            notaId: idMongo,
          },
        ],
      })

      return false
    }
  }

  static async lancarNotaFiscal(tokenDestino, id, idMongo, intName, intId) {
    try {
      const url = 'https://api.tiny.com.br/api2/nota.fiscal.lancar.estoque.php'

      const data = new URLSearchParams({
        token: tokenDestino,
        id: id,
        formato: 'JSON',
      })

      const response = await axios.post(url, data.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      if (response.status === 200 && response.data.retorno.status === 'OK') {
        await NotaFiscal.updateOne(
          { _id: idMongo },
          {
            $set: {
              status: 'estoque_lancado',
            },
          },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: intName,
          integrationId: intId,
          user: 'MyAppOne',
          userId: 'MyAppOne',
          action: 'lancar_estoque',
          message: 'Lançou estoque da NF de transferência na conta de destino',
          observacoes: [
            {
              notaId: idMongo,
            },
          ],
        })

        return response.data
      }

      throw new Error('Erro ao lançar estoque da nota fiscal')
    } catch (error) {
      console.log('erro de lançamento: ', error)
      await NotaFiscal.updateOne(
        { _id: idMongo },
        {
          $set: {
            status: 'erro_lancamento',
          },
        },
      )

      await RandomFunctions.setLogs(Logs, {
        integration: intName,
        integrationId: intId,
        user: 'MyAppOne',
        userId: 'MyAppOne',
        action: 'erro_lancamento',
        message: 'Ocorreu um erro ao lançar estoque da NF importada na conta de destino',
        observacoes: [
          {
            notaId: idMongo,
          },
        ],
      })

      return false
    }
  }

  static async atualizarDadosTiny(produtos) {
    const integracoes = await IntegracaoTiny.find({
      status: 'active',
      'configs.produtos.permitirCusto': true,
    })

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    for (const int of integracoes) {
      try {
        const produtosAlterar = []

        for (const item of produtos) {
          try {
            const startTime = Date.now()

            const produtoTiny = await axios.get(
              `https://api.tiny.com.br/api2/produtos.pesquisa.php?token=${int.tokenApi_v2}&pesquisa=${item.sku}&formato=json`,
            )

            const requestTime = Date.now() - startTime
            const remainingTime = Math.max(1000 - requestTime, 0)

            if (remainingTime > 0) await delay(remainingTime)

            if (produtoTiny.status === 200 && produtoTiny.data.retorno.status === 'OK') {
              const idTinyProduto =
                produtoTiny.data.retorno.produtos.find(
                  (itemTiny) => itemTiny.produto.codigo === item.sku,
                )?.produto || {}

              const url = 'https://api.tiny.com.br/api2/produto.obter.php'
              const payload = {
                token: int.tokenApi_v2,
                formato: 'JSON',
                id: idTinyProduto.id,
              }

              const startTime2 = Date.now()
              const response = await axios.post(url, new URLSearchParams(payload))

              const requestTime2 = Date.now() - startTime2
              const remainingTime2 = Math.max(1000 - requestTime2, 0)
              if (remainingTime2 > 0) await delay(remainingTime2)

              if (response.status === 200 && response.data.retorno.status === 'OK') {
                const dict = response.data
                const produto = dict.retorno.produto
                produto.id = undefined
                produto.preco = 0.1
                produto.preco_custo = item.cost

                produtosAlterar.push({
                  produto: {
                    sequencia: produtosAlterar.length + 1,
                    ...produto,
                  },
                })
              }
            }
          } catch (error) {}
        }

        const produtosProcessados = {
          produtos: produtosAlterar,
        }

        const startTime3 = Date.now()
        if (produtosProcessados.produtos.length > 0) {
          const url1 = 'https://api.tiny.com.br/api2/produto.alterar.php'

          const payload1 = {
            token: int.tokenApi_v2,
            produto: JSON.stringify(produtosProcessados),
            formato: 'JSON',
          }

          await axios.post(url1, new URLSearchParams(payload1))

          await RandomFunctions.setLogs(Logs, {
            integration: int.name,
            integrationId: int._id,
            user: 'MyAppOne',
            userId: 'MyAppOne',
            action: 'mudar_custos',
            message: 'Alterou os custos de alguns produtos no Tiny',
            observacoes: [
              Object.assign(
                {},
                ...produtosAlterar.map((item, index) => ({
                  [`produto${index + 1}`]: `${item.produto.codigo} - ${item.produto.preco_custo}`,
                })),
              ),
            ],
          })
        }

        const requestTime3 = Date.now() - startTime3
        const remainingTime3 = Math.max(1000 - requestTime3, 0)
        if (remainingTime3 > 0) await delay(remainingTime3)
      } catch (error) {}
    }
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let urlBackup
let dataBackup = `${2025}-${2}-${5}`
let continuar = true

class EstoqueController {
  static async getNotasEntrada(idIntegracao) {
    const integracao = await IntegracaoTiny.findOne({ _id: idIntegracao })
    const token = integracao.lastAccess_token.token
    const ignorar = integracao.configs.compras.ignorar
    let paginaAtual = 0
    let hasMore = true
    const requestInterval = 1100

    if (!integracao.configs.compras.permitirCompras) return

    await IntegrationFunctions.getNewTokensTiny()

    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = String(hoje.getMonth() + 1).padStart(2, '0')
    const dia = String(hoje.getDate()).padStart(2, '0')

    const dataFormatada = `${ano}-${mes}-${dia}`
    while (hasMore) {
      const url = `https://api.tiny.com.br/public-api/v3/notas?tipo=E&dataInicial=${integracao.configs.compras.dataCompras}&limit=100&offset=${paginaAtual}&dataFinal=${dataFormatada}`

      console.log('url: ', url)

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      await delay(requestInterval)

      const notas = response.data.itens
      notas.sort((a, b) => new Date(b.dataEmissao) - new Date(a.dataEmissao))

      if (notas.length === 100) {
        paginaAtual += notas.length
      } else {
        hasMore = false
      }

      let notalog = 1

      for (const nota of notas) {
        notalog += 1

        const cpfCnpj = nota.cliente.cpfCnpj.replace(/\D/g, '')
        if (ignorar.some((item) => item.cnpj.replace(/\D/g, '') === cpfCnpj)) continue

        const exists = await prisma.compras.findUnique({
          where: {
            idNota: nota.id,
          },
        })

        if (exists) return

        const notaDetalhes = await EstoqueController.getNotaDetalhes(nota.id, token)

        await delay(requestInterval)

        if (Number.parseInt(notaDetalhes.finalidade) === 4) continue

        const fornecedor = await EstoqueController.getOrCreateFornecedor(
          notaDetalhes.cliente,
        )

        const produtos = await EstoqueController.getProdutos(notaDetalhes.itens)

        const produtosNovos = []
        let produtosCreate = EstoqueController.criarProdutosOnCompras(
          notaDetalhes.itens,
          produtos,
          produtosNovos,
          cpfCnpj,
        )

        produtosCreate = produtosCreate.filter(
          (item) => item !== null && item !== undefined,
        )

        produtosCreate = produtosCreate.reduce((acc, produto) => {
          const produtoExistente = acc.find(
            (item) => item.produtoId === produto.produtoId,
          )

          if (produtoExistente) {
            produtoExistente.quantity += produto.quantity
            produtoExistente.valorTotal += produto.valorTotal
          } else {
            acc.push({ ...produto })
          }

          return acc
        }, [])

        try {
          await prisma.compras.create({
            data: {
              cnpjTiny: integracao.cnpj,
              idIntegracao: idIntegracao,
              idNota: notaDetalhes.id,
              numeroNota: notaDetalhes.numero,
              dataEmissao: new Date(notaDetalhes.dataEmissao),
              dataEntrada: new Date(notaDetalhes.dataInclusao.replace(' ', 'T')),
              fornecedor,
              ProdutosOnCompras: { create: produtosCreate },
              valor: notaDetalhes.valor,
              temProdutosNovos: produtosNovos.length > 0,
              ProdutosNovos: { create: produtosNovos },
            },
          })
        } catch (error) {
          console.log('error: ', error)
          console.log('\n')
          console.log('\n')

          console.log({
            cnpjTiny: integracao.cnpj,
            idIntegracao: idIntegracao,
            idNota: notaDetalhes.id,
            numeroNota: notaDetalhes.numero,
            dataEmissao: new Date(notaDetalhes.dataEmissao),
            dataEntrada: new Date(notaDetalhes.dataInclusao.replace(' ', 'T')),
            fornecedor,
            ProdutosOnCompras: { create: produtosCreate },
            valor: notaDetalhes.valor,
            temProdutosNovos: produtosNovos.length > 0,
            ProdutosNovos: { create: produtosNovos },
          })
          hasMore = false
          break
        }
      }
    }

    console.log('Finalizou a busca')
    continuar = false
  }

  static async getNotaDetalhes(notaId, token) {
    const response = await axios.get(
      `https://api.tiny.com.br/public-api/v3/notas/${notaId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    return response.data
  }

  static async getOrCreateFornecedor(cliente) {
    const existingFornecedor = await prisma.fornecedores.findFirst({
      where: {
        OR: [
          { cpfCnpj: { equals: cliente.cpfCnpj } },
          { idTiny: { equals: cliente.id } },
        ],
      },
    })

    if (existingFornecedor) {
      return { connect: { id: existingFornecedor.id } }
    }
    return {
      create: { nome: cliente.nome, cpfCnpj: cliente.cpfCnpj, idTiny: cliente.id },
    }
  }

  static async getProdutos(itens) {
    const produtosData = itens.flatMap((item) => [String(item.idProduto), item.codigo])
    return prisma.produtos.findMany({
      where: {
        OR: [{ tinyId: { in: produtosData } }, { sku: { in: produtosData } }],
      },
      include: { Desmembramento: true },
    })
  }

  static criarProdutosOnCompras(itens, produtos, produtosNovos, cpfCnpjNumeros) {
    const cnpjEspecifico = 'xx.xxx.xxx/xxxx-xx'.replace(/\D/g, '')

    return itens.map((item) => {
      const produtoMyApp = produtos.find(
        (produto) => produto.sku === item.codigo || produto.tinyId === item.idProduto,
      )

      if (produtoMyApp) {
        const desmembramento = produtoMyApp.Desmembramento.find(
          (item) => item.cpfCnpj.replace(/\D/g, '') === cpfCnpjNumeros,
        )

        const defaultDesmemb = produtoMyApp.Desmembramento.find(
          (item) => item.cpfCnpj.replace(/\D/g, '') === cnpjEspecifico,
        )

        let desmembramentoFinal

        if (desmembramento) {
          if (
            item.unidade !== desmembramento.tipo &&
            item.quantidade < desmembramento.quantidade
          ) {
            desmembramentoFinal = defaultDesmemb
          } else {
            desmembramentoFinal = desmembramento
          }
        } else {
          desmembramentoFinal = defaultDesmemb
        }

        return {
          produtoId: produtoMyApp.id,
          quantity: item.quantidade * Number.parseInt(desmembramentoFinal.quantidade),
          valor:
            Math.round(
              (item.valorUnitario / Number.parseInt(desmembramentoFinal.quantidade)) *
                100,
            ) / 100,
          valorTotal: item.valorTotal,
        }
      }
      produtosNovos.push({
        idTiny: item.idProduto,
        sku: item.codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnitario: Math.round(Number.parseFloat(item.valorUnitario) * 100) / 100,
        valorTotal: item.valorTotal,
      })
      return null
    })
  }

  static async editarProdutoOnCompras(
    produtoNota,
    desmembramento,
    idProdutoOn,
    cpfCnpjNumeros,
  ) {
    const cnpjEspecifico = 'xx.xxx.xxx/xxxx-xx'.replace(/\D/g, '')

    const desmembramentoCerto = desmembramento.find(
      (item) => item.cpfCnpj.replace(/\D/g, '') === cpfCnpjNumeros,
    )

    const defaultDesmemb = desmembramento.find(
      (item) => item.cpfCnpj.replace(/\D/g, '') === cnpjEspecifico,
    )

    let desmembramentoFinal

    if (desmembramentoCerto) {
      if (
        produtoNota.unidade !== desmembramentoCerto.tipo &&
        produtoNota.quantidade < desmembramentoCerto.quantidade
      ) {
        desmembramentoFinal = defaultDesmemb
      } else {
        desmembramentoFinal = desmembramentoCerto
      }
    } else {
      desmembramentoFinal = defaultDesmemb
    }

    await prisma.produtosOnCompras.update({
      where: { id: idProdutoOn },
      data: {
        quantity:
          produtoNota.quantidade * Number.parseInt(desmembramentoFinal.quantidade),
        valor: Number.parseFloat(
          (
            produtoNota.valorUnitario / Number.parseInt(desmembramentoFinal.quantidade)
          ).toFixed(2),
        ),
      },
    })
  }

  // Vendas abaixo

  static async getNotasVenda(idIntegracao, dataBack) {
    let integracao = await IntegracaoTiny.findOne({ _id: idIntegracao })
    let token = integracao.lastAccess_token.token
    const ignorar = integracao.configs.vendas.ignorar

    //const requestInterval = 700
    const requestInterval = 200

    if (!integracao.configs.vendas.permitirVendas) return

    await IntegrationFunctions.getNewTokensTiny()

    const dataInicial = integracao.configs.vendas.dataVendas

    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = String(hoje.getMonth() + 1).padStart(2, '0')
    const dia = String(hoje.getDate()).padStart(2, '0')

    //let newDateInitial = `${ano}-${mes}-${dia}`
    let newDateInitial = dataBack

    let contador = 0
    let falta = 57926

    while (new Date(newDateInitial) >= new Date(dataInicial)) {
      let hasMore = true
      let paginaAtual = 0

      contador += 1
      if (contador >= 100) {
        console.log('Gerando novos Tokens')
        await IntegrationFunctions.getNewTokensTiny()
        await delay(requestInterval)

        integracao = await IntegracaoTiny.findOne({ _id: idIntegracao })
        token = integracao.lastAccess_token.token
        contador = 0
      }

      while (hasMore) {
        const url = `https://api.tiny.com.br/public-api/v3/notas?tipo=S&dataInicial=${newDateInitial}&limit=100&offset=${paginaAtual}&dataFinal=${newDateInitial}`

        urlBackup = url

        console.log('faltam: ', falta, 'url: ', url)

        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        })

        await delay(requestInterval)

        const notas = response.data.itens
        notas.sort((a, b) => new Date(b.dataEmissao) - new Date(a.dataEmissao))

        if (notas.length === 100) {
          paginaAtual += notas.length
        } else {
          hasMore = false
        }

        falta -= notas.length

        let countNotas = 0
        for (const nota of notas) {
          countNotas += 1

          console.log('nota: ', countNotas)

          const cpfCnpj = nota.cliente.cpfCnpj.replace(/\D/g, '')
          if (ignorar.some((item) => item.cnpj.replace(/\D/g, '') === cpfCnpj)) continue

          const exists = await prisma.vendas.findUnique({
            where: {
              idNota: nota.id,
            },
          })

          if (exists) continue

          const notaDetalhes = await EstoqueController.getNotaDetalhes(nota.id, token)

          await delay(requestInterval)

          if (Number.parseInt(notaDetalhes.finalidade) === 4) continue

          const cliente = await EstoqueController.getOrCreateCliente(notaDetalhes.cliente)

          const produtos = await EstoqueController.getProdutos(notaDetalhes.itens)

          const produtosNovos = []
          let produtosCreate = EstoqueController.criarProdutosOnVendas(
            notaDetalhes.itens,
            produtos,
            produtosNovos,
            cpfCnpj,
          )

          produtosCreate = produtosCreate.filter(
            (item) => item !== null && item !== undefined,
          )

          produtosCreate = produtosCreate.reduce((acc, produto) => {
            const produtoExistente = acc.find(
              (item) => item.produtoId === produto.produtoId,
            )

            if (produtoExistente) {
              produtoExistente.quantity += produto.quantity
              produtoExistente.valorTotal += produto.valorTotal
            } else {
              acc.push({ ...produto })
            }

            return acc
          }, [])

          try {
            await prisma.vendas.create({
              data: {
                cnpjTiny: integracao.cnpj,
                idIntegracao: idIntegracao,
                idNota: notaDetalhes.id,
                numeroNota: notaDetalhes.numero,
                dataEmissao: new Date(notaDetalhes.dataEmissao),
                dataInclusao: new Date(notaDetalhes.dataInclusao.replace(' ', 'T')),
                cliente,
                ProdutosOnVendas: { create: produtosCreate },
                valor: notaDetalhes.valor,
                temProdutosNovos: produtosNovos.length > 0,
                ProdutosEstranhos: { create: produtosNovos },
                ...(notaDetalhes?.ecommerce?.id
                  ? { ecommerceId: notaDetalhes?.ecommerce?.id }
                  : {}),
                ...(notaDetalhes?.ecommerce?.nome
                  ? { ecommerceNome: notaDetalhes?.ecommerce?.nome }
                  : {}),
                ...(notaDetalhes?.ecommerce?.numeroPedidoEcommerce
                  ? {
                      numeroPedidoEcommerce:
                        notaDetalhes?.ecommerce?.numeroPedidoEcommerce,
                    }
                  : {}),
              },
            })
            console.log('nota: ', notaDetalhes.id, ' criada')
          } catch (error) {
            // console.log('error: ', error)
            console.log('\n')
            console.log('\n')

            console.log({
              cnpjTiny: integracao.cnpj,
              idIntegracao: idIntegracao,
              idNota: notaDetalhes.id,
              numeroNota: notaDetalhes.numero,
              dataEmissao: new Date(notaDetalhes.dataEmissao),
              dataInclusao: new Date(notaDetalhes.dataInclusao.replace(' ', 'T')),
              cliente,
              ProdutosOnVendas: { create: produtosCreate },
              valor: notaDetalhes.valor,
              temProdutosNovos: produtosNovos.length > 0,
              ProdutosEstranhos: { create: produtosNovos },
              ...(notaDetalhes?.ecommerce?.id
                ? { ecommerceId: notaDetalhes?.ecommerce?.id }
                : {}),
              ...(notaDetalhes?.ecommerce?.nome
                ? { ecommerceNome: notaDetalhes?.ecommerce?.nome }
                : {}),
              ...(notaDetalhes?.ecommerce?.numeroPedidoEcommerce
                ? {
                    numeroPedidoEcommerce: notaDetalhes?.ecommerce?.numeroPedidoEcommerce,
                  }
                : {}),
            })
            hasMore = false

            console.log('DEU ERRO')
            console.log('URL: ', url)

            throw new Error(error)

            // break
          }
        }
      }

      const startDate = new Date(newDateInitial)
      const year = startDate.getFullYear()
      const month = String(startDate.getMonth() + 1).padStart(2, '0')
      const day = String(startDate.getDate()).padStart(2, '0')
      newDateInitial = `${year}-${month}-${day}`
      dataBackup = newDateInitial
    }

    console.log('Finalizou a busca')
  }

  static async getOrCreateCliente(cliente) {
    const existingCliente = await prisma.clientes.findFirst({
      where: {
        OR: [
          { cpfCnpj: { equals: cliente.cpfCnpj } },
          { idTiny: { equals: cliente.id } },
        ],
      },
    })

    if (existingCliente) {
      return { connect: { id: existingCliente.id } }
    }
    return {
      create: {
        nome: cliente.nome,
        cpfCnpj: cliente.cpfCnpj,
        idTiny: cliente.id,
        endereco: cliente.endereco.endereco,
        numero: String(cliente.endereco.numero),
        complemento: cliente.endereco.complemento,
        bairro: cliente.endereco.bairro,
        municipio: cliente.endereco.municipio,
        cep: cliente.endereco.cep,
        uf: cliente.endereco.uf,
        pais: cliente.endereco.pais,
      },
    }
  }

  static criarProdutosOnVendas(itens, produtos, produtosNovos) {
    return itens.map((item) => {
      const produtoMyApp = produtos.find(
        (produto) => produto.sku === item.codigo || produto.tinyId === item.idProduto,
      )

      if (produtoMyApp) {
        return {
          produtoId: produtoMyApp.id,
          quantity: item.quantidade,
          valor: Math.round(Number.parseFloat(item.valorUnitario) * 100) / 100,
          valorTotal: item.valorTotal,
        }
      }
      produtosNovos.push({
        idTiny: item.idProduto,
        sku: item.codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnitario: Math.round(Number.parseFloat(item.valorUnitario) * 100) / 100,
        valorTotal: item.valorTotal,
      })
      return null
    })
  }
}

async function renovarRefreshToken(idIntegracao) {
  try {
    const integracao = await IntegracaoTiny.findOne({
      _id: idIntegracao,
    })

    if (!integracao) return

    await IntegrationFunctions.refreshTokenTiny(
      integracao.refresh_token,
      idIntegracao,
      integracao.clientId,
      integracao.clientSecret,
    )
  } catch (error) {
    console.log('error: ', error)
    return
  }
}

function formatDate(dateString) {
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

function gerarHorarios(intervalo) {
  const horarios = []

  if (Number.isNaN(Number(intervalo)) || intervalo <= 0) return []

  for (let i = 0; i < 24 * 60; i += Number.parseInt(intervalo)) {
    if (i >= 24 * 60) break

    const horas = String(Math.floor(i / 60)).padStart(2, '0')
    const minutos = String(i % 60).padStart(2, '0')
    horarios.push(`${horas}:${minutos}`)
  }

  return horarios
}

function calcularSimilaridade(produto, value) {
  const campos = ['gtin', 'name', 'sku']
  let similaridade = 0

  campos.forEach((campo) => {
    if (produto[campo]?.includes(value)) {
      similaridade += (produto[campo].match(new RegExp(value, 'g')) || []).length
    }
  })

  return similaridade
}

function formatarCnpjCpf(cnpjCpf) {
  const soNumeros = cnpjCpf.replace(/\D/g, '')

  if (soNumeros.length === 11) {
    return soNumeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (soNumeros.length === 14) {
    return soNumeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }

  return cnpjCpf // Retorna o valor original caso não seja CPF nem CNPJ
}

async function fazer() {
  while (continuar) {
    console.log('aqui')
    try {
      await EstoqueController.getNotasVenda('6788fcb2ccaeae6b1cbc04c0', dataBackup)
      console.log('acabou')
    } catch (err) {
      console.log('DEU ERROOOOO:')
      console.log('urlBackup: ', urlBackup)
    }

    await delay(80000)
  }
}

//ApiTinyController.incluirNotaFiscal('68468478d14e9dd548ebb1c3')
//ApiTinyController.cirarOrdemCompra()
//ApiTinyController.lancarEstoqueNotaCompra('1033401876')

// ;(async () => {
//   const integracao = await IntegracaoTiny.findOne({ cnpj: '37677337000490' })
//   const transferencias = integracao.configs.transferencias

//   await NotaFiscal.updateMany(
//     { cnpjIntegracao: '37677337000490' },
//     {
//       $set: {
//         cliente: {
//           natureza_operacao: transferencias.natureza_operacao,
//           id_natureza_operacao: transferencias.id_natureza_operacao,
//           codigo: transferencias.codigo,
//           nome: transferencias.nameConta,
//           tipoPessoa: transferencias.tipoPessoa,
//           contribuinte: 1,
//           cnpj: transferencias.cnpjConta,
//           ie: transferencias.inscricao,
//           cep: transferencias.cep,
//           municipio: transferencias.municipio,
//           uf: transferencias.estado,
//           endereco: transferencias.endereco,
//           bairro: transferencias.bairro,
//           enderecoNro: transferencias.enderecoNro,
//           complemento: transferencias.complemento,
//           fone: transferencias.telefone,
//           email: transferencias.email,
//         },
//       },
//     },
//   )
// })()

module.exports = {
  ApiTinyController,
  renovarRefreshToken,
  EstoqueController,
}

const axios = require('axios')
const { google } = require('googleapis')

const IntegracaoGS = require('../models/IntegracaoGS')
const IntegracaoML = require('../models/IntegracaoML')
const IntegracaoMGL = require('../models/IntegracaoMGL')
const mongoose = require('mongoose')

const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('csv-parse/sync')

const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()

const IntegrationFunctions = require('../utils/IntegrationFunctions')

const fsSync = require('node:fs').promises

const { ApiTinyController } = require('./ApiTinyController')

class ApiGoogleSheetsController {
  static async getNewIntegration(req, res) {
    const { name } = req.body

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

      const integrationExists = await IntegracaoGS.findOne({
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

      const existes = await IntegracaoGS.find()

      if (existes.length > 0) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'exists',
          message: [
            'Já existe uma integração ativa com o Google Sheets. O MyAppOne só consegue manter uma ativa por vez.',
          ],
        })
        await session.abortTransaction()
        return
      }

      const newIntegration = await IntegracaoGS.create(
        [
          {
            name: name,
            status: 'wait_auth',
            short_name: `temporario-${name.trim().replace(' ', '')}`,
          },
        ],
        {
          session,
        },
      )

      const newIntegrationId = newIntegration[0]._id.toString()

      await session.commitTransaction()
      session.endSession()

      const CLIENT_ID = process.env.CLIENT_ID_GS
      const CLIENT_SECRET = process.env.CLIENT_SECRET_GS
      const REDIRECT_URI = process.env.REDIRECT_URI_GS

      const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

      const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: JSON.stringify({ id: newIntegrationId }),
      })

      res.status(201).json({ url: authUrl })
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

  static async saveIntegrationGS(req, res) {
    const { code, state } = req.body

    try {
      const exists = await IntegracaoGS.findOne({ _id: state })

      if (exists && exists.status !== 'wait_auth') {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: ['Ja existe uma integração ativa com essa conta !'],
        })
        return
      }

      const integration = await IntegracaoGS.updateOne(
        { _id: state },
        {
          $set: {
            status: 'await_configure',
            tabela_relacionamento: { timer: 0 },
            code: code,
          },
        },
      )

      const path = './timers/atualizar_planilha/config.json'
      const data = await fsSync.readFile(path, 'utf8')
      const jsonData = JSON.parse(data)

      jsonData.horarios = []
      jsonData.timerActive = false
      jsonData.status = 'await_configure'
      jsonData.idIntegracao = state

      await fsSync.writeFile(path, JSON.stringify(jsonData, null, 2), 'utf8')

      res.status(201).json({ message: 'Integração realizada com sucesso !' })
    } catch (error) {
      try {
        const deletado = await integration.findOne({ _id: state })

        if (deletado && deletado.status === 'wait_auth') {
          await integration.deleteOne({ _id: state })
        }
      } catch (e) {}

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter o link de autenticação. Por favor tente novamente em alguns minutos.',
          'A tentativa de integração foi cancelada, e você pode tentar novamente',
        ],
      })
    }
  }

  static async excluirIntegracao(req, res) {
    const { id } = req.body

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      console.log(id)
      const usuario = await IntegracaoGS.findOne({ _id: id }).session(session)

      if (!usuario) {
        await session.abortTransaction()
        session.endSession()
        return res.status(501).json({
          erroCode: '501',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id!'],
        })
      }

      if (usuario.status === 'wait_auth') {
        await IntegracaoGS.deleteOne({ _id: id }).session(session)
        await session.commitTransaction()
        session.endSession()
        return res.status(201).json({ message: 'Integração excluída com sucesso!' })
      }

      await IntegracaoGS.deleteOne({ _id: id }).session(session)

      const path = './timers/atualizar_planilha/config.json'
      const data = await fsSync.readFile(path, 'utf8')
      const jsonData = JSON.parse(data)

      jsonData.horarios = []
      jsonData.timerActive = false
      jsonData.status = ''
      jsonData.idIntegracao = ''

      await fsSync.writeFile(path, JSON.stringify(jsonData, null, 2), 'utf8')

      await session.commitTransaction()
      session.endSession()

      return res.status(201).json({ message: 'Integração excluída com sucesso!' })
    } catch (error) {
      console.log(error)
      await session.abortTransaction()
      session.endSession()
      return res.status(500).json({
        erroCode: '500',
        erroType: 'server_error',
        message: ['Ocorreu um erro ao tentar excluir a integração.'],
      })
    }
  }

  static async concluirIntegration(req, res) {
    try {
      const { id } = req.body

      const integration = await IntegracaoGS.findOne({
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

      const CLIENT_ID = process.env.CLIENT_ID_GS
      const CLIENT_SECRET = process.env.CLIENT_SECRET_GS
      const REDIRECT_URI = process.env.REDIRECT_URI_GS

      const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

      const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: JSON.stringify({ id: newIntegrationId }),
      })

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

  static async functionsOffIntegration(req, res) {
    try {
      const { action, id } = req.body

      if (action === 'ativar') {
        await IntegracaoGS.updateOne(
          { _id: id },
          {
            $set: {
              status: 'active',
            },
          },
        )
      }

      if (action === 'pausar') {
        await IntegracaoGS.updateOne(
          { _id: id },
          {
            $set: {
              status: 'paused',
            },
          },
        )
      }

      res.status(201).json({ message: 'ação concluida com sucesso !' })
    } catch {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Não foi possível concluir a ação, tente novamente em alguns minutos !',
        ],
      })
    }
  }

  static async getRowSheet(req, res) {
    const { sheetId, abaId, integrationId, row } = req.body

    const integracao = await IntegracaoGS.findOne({
      _id: integrationId,
    })

    const linha = await produtos(integracao.code, sheetId, abaId)

    res.status(201).json({ linha: linha[row] })
  }

  static async updateIntegration(req, res) {
    const { id, updated } = req.body

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const original = await IntegracaoGS.findById(id).session(session)

      if (!original) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id!'],
        })
      }

      const [shortExistsInGS, shortExistsInML, shortExistsInMGL] = await Promise.all([
        IntegracaoGS.findOne({ short_name: updated.short_name }),
        IntegracaoML.findOne({ short_name: updated.short_name }),
        IntegracaoMGL.findOne({ short_name: updated.short_name }),
      ])
      const shortExists = shortExistsInGS || shortExistsInML || shortExistsInMGL

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

      const updatedData = IntegrationFunctions.mapToSchemaGSFormat(updated)

      const changes = IntegrationFunctions.detectEditableChangesGS(
        original.toObject(),
        updatedData,
      )

      if (changes.tabela_relacionamento) {
        const path = './timers/atualizar_planilha/config.json'

        const data = await fsSync.readFile(path, 'utf8')
        const jsonData = JSON.parse(data)
        const horarios = gerarHorarios(changes.tabela_relacionamento.timer)

        jsonData.horarios = horarios
        jsonData.timerActive = !(
          Number.parseInt(changes.tabela_relacionamento.timer) === 0
        )
        jsonData.status =
          original.status === 'await_configure' ? 'active' : original.status

        await fsSync.writeFile(path, JSON.stringify(jsonData, null, 2), 'utf8')
      }

      if (Object.keys(changes).length > 0) {
        await IntegracaoGS.updateOne(
          { _id: id },
          {
            $set: {
              ...changes,
              ...(original.status === 'await_configure' ? { status: 'active' } : {}),
            },
          },
          { session },
        )
      }

      await session.commitTransaction()
      session.endSession()

      res.status(201).json({ message: 'Integração atualizada com sucesso !' })
    } catch (error) {
      console.log(error)
      await session.abortTransaction()
      session.endSession()
      res.status(500).json({
        erroCode: '500',
        erroType: 'update_error',
        message: ['Ocorreu um erro ao tentar atualizar a integração.'],
      })
    }
  }
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

async function produtos(clientToken, sheet_id, aba_id) {
  const TOKEN_PATH = clientToken
  const CREDENTIALS_PATH = './credentials/credentials.json'

  let credentials
  try {
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
  } catch (error) {
    throw new Error('Arquivo de credenciais não encontrado.')
  }

  const { client_secret, client_id, redirect_uris } = credentials.web
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  if (TOKEN_PATH) {
    const token = TOKEN_PATH
    oAuth2Client.setCredentials(token)
  } else {
    throw new Error('O Token não foi enviado')
  }

  const token = oAuth2Client.credentials

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheet_id}/gviz/tq?tqx=out:csv&gid=${aba_id}`
  const response = await axios.get(sheetUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    family: 4,
  })

  const rows = parse(response.data, {
    delimiter: ',',
    skip_empty_lines: true,
  })

  return rows
}

async function atualizarProdutos(idIntegracao) {
  const integracao = await IntegracaoGS.findById(idIntegracao)

  const itens = await produtos(
    integracao.code,
    integracao.sheetId,
    integracao.tabela_relacionamento.abaId,
  )

  const updatedItems = itens
    .map((item) => {
      if (
        item[1] === '#VALUE!' ||
        item[1] === '' ||
        item[2] === '#N/A' ||
        !item[integracao.tabela_relacionamento.sku]
      )
        return null

      const updatedItem = {
        sku: item[integracao.tabela_relacionamento.sku],
      }

      const addProperty = (key, value) => (value ? { [key]: value } : {})

      return {
        ...updatedItem,
        ...addProperty(
          'cost',
          Number.parseFloat(
            item[integracao.tabela_relacionamento.cost].replace(',', '.'),
          ) || null,
        ), // Garante que cost seja um número ou null
        ...addProperty('brandrule', item[integracao.tabela_relacionamento.rm] || null),
        ...addProperty('fullrule', item[integracao.tabela_relacionamento.rmf] || null),
        ...addProperty(
          'searchform',
          item[integracao.tabela_relacionamento.searchForm] || null,
        ),
        ...addProperty(
          'confirmform',
          item[integracao.tabela_relacionamento.comfirm] || null,
        ),
        ...addProperty(
          'catalog_id',
          item[integracao.tabela_relacionamento.catalog] || null,
        ),
        ...addProperty(
          'weight',
          Number.parseFloat(
            item[integracao.tabela_relacionamento.peso].replace(',', '.'),
          ) || null,
        ),
      }
    })
    .filter((item) => item !== null)

  const skus = updatedItems.map((p) => `'${p.sku}'`).join(',')

  const antes = await prisma.$queryRawUnsafe(
    `SELECT sku, cost, tinyId
    FROM Produtos WHERE sku IN (${skus})`,
  )

  await atualizarProdutosEmLotes(updatedItems)

  const depois = await prisma.$queryRawUnsafe(
    `SELECT sku, cost, tinyId
    FROM Produtos WHERE sku IN (${skus})`,
  )

  const alterados = []
  const inalterados = []

  antes.forEach((antigo) => {
    const novo = depois.find((p) => p.sku === antigo.sku)
    if (JSON.stringify(antigo) !== JSON.stringify(novo)) {
      alterados.push(novo)
    } else {
      inalterados.push(novo)
    }
  })

  if (alterados.length) {
    await ApiTinyController.atualizarDadosTiny(alterados)
  }
}

async function atualizarProdutosEmLotes(produtos) {
  const tamanhoLote = 100

  for (let i = 0; i < produtos.length; i += tamanhoLote) {
    const lote = produtos.slice(i, i + tamanhoLote)

    const transactionPromises = []

    lote.forEach((produto) => {
      const escapeString = (str) => {
        return str ? str.replace(/'/g, "''") : ''
      }

      const query = `
  UPDATE Produtos SET 
    cost = CASE 
      WHEN sku = '${escapeString(produto.sku)}' AND ${produto.cost !== undefined ? '1' : '0'} THEN 
        ${produto.cost !== undefined ? `${produto.cost}` : `${'cost'}`} 
      ELSE cost 
    END,
    brandrule = CASE 
      WHEN sku = '${escapeString(produto.sku)}' AND ${produto.brandrule !== undefined ? '1' : '0'} THEN 
        '${escapeString(produto.brandrule)}' 
      ELSE brandrule 
    END,
    fullrule = CASE 
      WHEN sku = '${escapeString(produto.sku)}' AND ${produto.fullrule !== undefined ? '1' : '0'} THEN 
        '${escapeString(produto.fullrule)}' 
      ELSE fullrule 
    END,
    searchform = CASE 
      WHEN sku = '${escapeString(produto.sku)}' AND ${produto.searchform !== undefined ? '1' : '0'} THEN 
        '${escapeString(produto.searchform)}' 
      ELSE searchform 
    END,
    confirmform = CASE 
      WHEN sku = '${escapeString(produto.sku)}' AND ${produto.confirmform !== undefined ? '1' : '0'} THEN 
        '${escapeString(produto.confirmform)}' 
      ELSE confirmform 
    END,
    catalog_id = CASE 
      WHEN sku = '${escapeString(produto.sku)}' AND ${produto.catalog_id !== undefined ? '1' : '0'} THEN 
        '${escapeString(produto.catalog_id)}' 
      ELSE catalog_id 
    END,
    weight = CASE 
      WHEN sku = '${escapeString(produto.sku)}' AND ${produto.weight !== undefined ? '1' : '0'} THEN 
        ${produto.weight !== undefined ? `${produto.weight}` : `${'weight'}`} 
      ELSE weight 
    END
  WHERE sku = '${escapeString(produto.sku)}'
`

      transactionPromises.push(prisma.$executeRawUnsafe(query))
    })

    try {
      await prisma.$transaction(transactionPromises)
      console.log(
        `Lote ${i / tamanhoLote + 1} de ${Math.ceil(produtos.length / tamanhoLote)} atualizado com sucesso!`,
      )
    } catch (error) {
      console.error(`Erro ao atualizar lote ${i / tamanhoLote + 1}:`, error)
      console.log(lote)
      break
    }
  }

  console.log('Atualização de todos os produtos concluída!')
}

module.exports = {
  ApiGoogleSheetsController,
  atualizarProdutos,
}

// Imports de bibliotecas externas
const axios = require('axios')
const mongoose = require('mongoose')
const { PrismaClient, Prisma } = require('@prisma/client')
const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')

// Imports de arquivos locais
const IntegracaoShopee = require('../models/IntegracaoShopee')
const RandomFunctions = require('../utils/RandomFunctions')
const IntegrationFunctions = require('../utils/IntegrationFunctions')
const Logs = require('../models/Logs')
const fsSync = require('node:fs').promises

const prisma = new PrismaClient()

module.exports = class ApiShopeeController {
  static async getNewIntegration(req, res) {
    const { name, partnerId, partnerKey } = req.body

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

      let integrationExists = await IntegracaoShopee.findOne({
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

      const encryptionKey = process.env.SECRET_KEY_SHOPEE
      const algorithm = 'aes-256-cbc'

      function encryptData(data) {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv(
          algorithm,
          Buffer.from(encryptionKey, 'hex'),
          iv,
        )
        let encrypted = cipher.update(data, 'utf8', 'hex')
        encrypted += cipher.final('hex')
        return `${iv.toString('hex')}:${encrypted}`
      }

      const encryptedPartnerKey = encryptData(partnerKey)
      const encryptedPartnerId = encryptData(partnerId.toString())

      integrationExists = await IntegracaoShopee.findOne({
        partner_key: encryptedPartnerKey,
        partner_id: encryptedPartnerId,
      }).session(session)

      if (integrationExists) {
        res.status(501).json({
          erroCode: '501',
          erroType: 'duplicated_integration',
          message: ['Já existe uma integração com esse PartnerId ou Partner Secret'],
        })
        await session.abortTransaction()
        return
      }

      const newIntegration = await IntegracaoShopee.create(
        [
          {
            name: name,
            status: 'wait_auth',
            short_name: `temporario-shopee-${name.trim().replace(' ', '')}`,
            partner_key: encryptedPartnerKey,
            partner_id: encryptedPartnerId,
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

      const api_path = '/api/v2/shop/auth_partner'
      const redirect = `${process.env.REDIRECT_URI_SHOPEE}?state=${newIntegrationId}`
      const timestamp = Math.floor(Date.now() / 1000)

      const baseString = `${partnerId}${api_path}${timestamp}`

      const sign = crypto
        .createHmac('sha256', partnerKey)
        .update(baseString)
        .digest('hex')

      const url = `https://partner.shopeemobile.com${api_path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirect)}`

      res.status(201).json({ url: url })
    } catch (error) {
      console.log('error: ', error)

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
    const { code, state, shop_id } = req.body
    const user = req.user

    try {
      const exists = await IntegracaoShopee.findOne({ _id: state })

      if (!exists) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: ['Não existe integração com esse id (state) no banco de dados.'],
        })
        return
      }

      if (exists && exists.status !== 'wait_auth') {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: ['Ja existe uma integração ativa com essa conta !'],
        })
        return
      }

      const partnerId = RandomFunctions.decryptDataShopee(exists.partner_id)
      const partnerSecret = RandomFunctions.decryptDataShopee(exists.partner_key)

      const timestamp = Math.floor(Date.now() / 1000)
      const host = 'https://partner.shopeemobile.com'
      const path = '/api/v2/auth/token/get'
      const url = `${host}${path}`

      // Gerar a sign
      const baseString = `${partnerId}${path}${timestamp}`
      const sign = crypto
        .createHmac('sha256', partnerSecret)
        .update(baseString)
        .digest('hex')

      const fullUrl = `${url}?partner_id=${Number.parseInt(partnerId)}&timestamp=${timestamp}&sign=${sign}`

      const body = {
        code,
        shop_id: Number(shop_id),
        partner_id: Number(partnerId),
      }

      const headers = {
        'Content-Type': 'application/json',
      }

      const response = await axios.post(fullUrl, body, { headers })
      const { refresh_token, access_token } = response.data

      if (!refresh_token) throw new Error('Erro na requisição')

      const integration = await IntegracaoShopee.findOneAndUpdate(
        { _id: state },
        {
          $set: {
            status: 'active',
            refresh_token: refresh_token,
            code: code,
            seller_id: shop_id,
            'lastAccess_token.token': access_token,
            'lastAccess_token.updateAt': new Date(),
          },
        },
        { returnDocument: 'after' },
      )

      await RandomFunctions.setLogs(Logs, {
        integration: integration.name,
        integrationId: integration._id,
        user: user.name,
        userId: user._id,
        action: 'Trocar Code por Token',
        message: 'Troca do Code por Refresh_Token na Shopee',
      })

      const path2 = './timers/shopee/refresh_token/config.json'
      const datajson = await fsSync.readFile(path2, 'utf8')
      const jsonData = JSON.parse(datajson)
      jsonData.integracoes.push(state)
      await fsSync.writeFile(path2, JSON.stringify(jsonData, null, 2), 'utf8')

      res.status(201).json({ message: 'Integração realizada com sucesso !' })
    } catch (error) {
      console.log('error: ', error)

      try {
        const deletado = await IntegracaoShopee.findOne({ _id: state })

        if (deletado && deletado.status === 'wait_auth') {
          await IntegracaoShopee.deleteOne({ _id: state })
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

  static async concluirIntegration(req, res) {
    try {
      const { id } = req.body

      const integration = await IntegracaoShopee.findOne({
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

      const partnerId = RandomFunctions.decryptDataShopee(integration.partner_id)
      const partnerSecret = RandomFunctions.decryptDataShopee(integration.partner_key)

      const api_path = '/api/v2/shop/auth_partner'
      const redirect = `${process.env.REDIRECT_URI_SHOPEE}?state=${newIntegrationId}`
      const timestamp = Math.floor(Date.now() / 1000)

      const baseString = `${partnerId}${api_path}${timestamp}`

      const sign = crypto
        .createHmac('sha256', partnerSecret)
        .update(baseString)
        .digest('hex')

      const url = `https://partner.shopeemobile.com${api_path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirect)}`

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
      const user = req.user

      if (action === 'ativar') {
        const atualizada = await IntegracaoShopee.updateOne(
          { _id: id },
          {
            $set: {
              status: 'active',
            },
          },
          { returnDocument: 'after' },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: atualizada.name,
          integrationId: atualizada._id,
          user: user.name,
          userId: user._id,
          action: 'Ativar integração',
          message: 'Ativou a integração com a Shopee.',
        })
      }

      if (action === 'pausar') {
        const atualizada = await IntegracaoShopee.updateOne(
          { _id: id },
          {
            $set: {
              status: 'paused',
            },
          },
          { returnDocument: 'after' },
        )

        await RandomFunctions.setLogs(Logs, {
          integration: atualizada.name,
          integrationId: atualizada._id,
          user: user.name,
          userId: user._id,
          action: 'Pausar integração',
          message: 'Pausou a integração com a Shopee.',
        })
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

  static async excluirIntegracao(req, res) {
    const { id } = req.body
    const user = req.user

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const usuario = await IntegracaoShopee.findOne({ _id: id }).session(session)

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
        await IntegracaoShopee.deleteOne({ _id: id }).session(session)

        await RandomFunctions.setLogs(
          Logs,
          {
            integration: usuario.name,
            integrationId: usuario._id,
            user: user.name,
            userId: user._id,
            action: 'Excluir integração',
            message: 'Integração com a Shopee excluida.',
          },
          session,
        )

        await session.commitTransaction()
        session.endSession()
        return res.status(201).json({ message: 'Integração excluída com sucesso!' })
      }

      const partner_id = RandomFunctions.decryptDataShopee(usuario.partner_id)
      const partner_key = RandomFunctions.decryptDataShopee(usuario.partner_key)

      const timestamp = Math.floor(Date.now() / 1000)
      const path = '/api/v2/shop/cancel_auth_partner'
      const base_string = `${partner_id}${path}${timestamp}`
      const sign = crypto
        .createHmac('sha256', partner_key)
        .update(base_string)
        .digest('hex')

      const redirect = encodeURIComponent(
        `${process.env.REDIRECT_URI_SHOPEE}?state=${usuario._id}&type=close`,
      )

      const url = `https://partner.shopeemobile.com${path}?partner_id=${Number(partner_id)}&timestamp=${timestamp}&sign=${sign}&redirect=${redirect}`

      await session.commitTransaction()
      session.endSession()
      return res.status(201).json({ url: url })
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

  static async concluirExclusao(req, res) {
    const { state } = req.body
    const user = req.user

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const exists = await IntegracaoShopee.findOne({ _id: state })

      if (!exists) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: ['Não existe integração com esse id (state) no banco de dados.'],
        })
        return
      }

      const integration = await IntegracaoShopee.findByIdAndDelete(state, { session })

      await RandomFunctions.setLogs(Logs, {
        integration: integration.name,
        integrationId: integration._id,
        user: user.name,
        userId: user._id,
        action: 'Trocar Code por Token',
        message: 'Troca do Code por Refresh_Token na Shopee',
      })

      const path2 = './timers/shopee/refresh_token/config.json'
      const datajson = await fsSync.readFile(path2, 'utf8')
      const jsonData = JSON.parse(datajson)
      jsonData.integracoes = jsonData.integracoes.filter((id) => id !== state)
      await fsSync.writeFile(path2, JSON.stringify(jsonData, null, 2), 'utf8')

      await session.commitTransaction()

      res.status(201).json({ message: 'Integração cancelada com sucesso !' })
    } catch (error) {
      console.log('error: ', error)

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao excluir a integração da Shopee com o MyAppOne, porém ela já foi cancelada na Shopee.',
          'Por favor, contate o desenvolvedor do sistema para resolver esse problema.',
        ],
      })
    } finally {
      session.endSession()
    }
  }

  static async updateIntegration(req, res) {
    const { id, updated } = req.body

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const original = await IntegracaoShopee.findById(id).session(session)

      if (!original) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id!'],
        })
      }

      const shortExists = await IntegracaoShopee.findOne({
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

      const updatedData = IntegrationFunctions.mapToSchemaShopeeFormat(updated)

      const changes = IntegrationFunctions.detectEditableChangesShopee(
        original.toObject(),
        updatedData,
      )

      changes.status = 'active'

      if (Object.keys(changes).length > 0) {
        await IntegracaoShopee.updateOne({ _id: id }, { $set: changes }, { session })
      }

      await session.commitTransaction()
      session.endSession()

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

  static async getTokenShopee(req, res) {
    const { secret, idIntegracao } = req.body

    try {
      const integracao = await IntegracaoShopee.findById(idIntegracao)

      if (!integracao) {
        return res.status(500).json({
          erroCode: '500',
          erroType: 'integration_not_found',
          message: ['Não existe nenhuma integração com esse ID'],
        })
      }

      if (!integracao.permitirAPI) {
        return res.status(500).json({
          erroCode: '500',
          erroType: 'integration_not_permissioned',
          message: ['Essa integração não permite coleta de access_token via Api'],
        })
      }

      if (!integracao.secret) {
        return res.status(500).json({
          erroCode: '500',
          erroType: 'integration_without_secret',
          message: ['Essa integração não possui um secret gerado'],
        })
      }

      if (integracao.secret !== secret) {
        return res.status(500).json({
          erroCode: '500',
          erroType: 'integration_without_secret',
          message: ['O secret informado está incorreto !'],
        })
      }

      const access_token = await IntegrationFunctions.refreshTokenShopee(
        integracao._id.toString(),
      )

      const tokenExpireUtc = new Date(access_token.expires)

      const brasiliaOffsetMs = -3 * 60 * 60 * 1000
      const expireInBrasilia = new Date(tokenExpireUtc.getTime() + brasiliaOffsetMs)

      const extendedExpire = new Date(expireInBrasilia.getTime() + 3 * 60 * 60 * 1000)

      const now = new Date()
      const nowInBrasilia = new Date(now.getTime() - now.getTimezoneOffset() * 60000)

      const diffMs = extendedExpire - nowInBrasilia

      let tempoFaltante = ''
      if (diffMs <= 0) {
        tempoFaltante = '00:00'
      } else {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

        const pad = (n) => String(n).padStart(2, '0')

        tempoFaltante = `${pad(diffHours)}:${pad(diffMinutes)}`
      }

      const partner_id = RandomFunctions.decryptDataShopee(integracao.partner_id)
      const partner_key = RandomFunctions.decryptDataShopee(integracao.partner_key)

      res.status(201).json({
        token: access_token.token,
        expires: tempoFaltante,
        partner_id,
        partner_key,
      })
    } catch (error) {
      console.log(error)

      res.status(500).json({
        erroCode: '500',
        erroType: 'token_error',
        message: ['Ocorreu um erro ao tentar obter o token da Shopee.'],
      })
    }
  }

  static async generateSecretShopee(req, res) {
    try {
      const { id } = req.query

      const SECRET_KEY = process.env.JWT_TOKEN

      const payload = {
        userId: 'MyAppOne',
        role: 'creator',
      }

      const token = jwt.sign(payload, SECRET_KEY, {
        issuer: 'api.myappone',
      })

      await IntegracaoShopee.updateOne(
        { _id: id },
        {
          $set: {
            secret: token,
          },
        },
      )

      res.status(201).json({
        secret: token,
      })
      return
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'secret_error',
        message: ['Ocorreu um erro ao tentar gerar o secret da Shopee.'],
      })
    }
  }
}

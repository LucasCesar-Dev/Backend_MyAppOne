const axios = require('axios')
const IntegracaoML = require('../models/IntegracaoML')
const IntegracaoGS = require('../models/IntegracaoGS')
const IntegracaoMGL = require('../models/IntegracaoMGL')
const IntegracaoTiny = require('../models/IntegracaoTiny')
const IntegracaoShopee = require('../models/IntegracaoShopee')
const Logs = require('../models/Logs')

const Precificacao = require('../models/Precificacao')
const mongoose = require('mongoose')
const IntegrationFunctions = require('../utils/IntegrationFunctions')
const RandomFunctions = require('../utils/RandomFunctions')

module.exports = class ApiMercadoLivreController {
  static async getNewIntegration(req, res) {
    const { name } = req.body
    const usuario = req.user

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

      const integrationExists = await IntegracaoML.findOne({
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

      const newIntegration = await IntegracaoML.create(
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

      await RandomFunctions.setLogs(
        Logs,
        {
          integration: newIntegration[0].name,
          integrationId: newIntegration[0]._id,
          user: usuario.name,
          userId: usuario._id,
          action: 'Criar integração',
          message: 'Uma nova integração com o Mercado Livre foi criada.',
        },
        session,
      )

      const newIntegrationId = newIntegration[0]._id.toString()

      await session.commitTransaction()
      session.endSession()

      const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.CLIENT_ID_ML}&redirect_uri=${process.env.REDIRECT_URI_ML}&state=${newIntegrationId}`

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

  static async concluirIntegration(req, res) {
    try {
      const { id } = req.body

      const integration = await IntegracaoML.findOne({
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

      const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.CLIENT_ID_ML}&redirect_uri=${process.env.REDIRECT_URI_ML}&state=${newIntegrationId}`

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
    const user = req.user

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const usuario = await IntegracaoML.findOne({ _id: id }).session(session)

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
        await IntegracaoML.deleteOne({ _id: id }).session(session)

        await RandomFunctions.setLogs(
          Logs,
          {
            integration: usuario.name,
            integrationId: usuario._id,
            user: user.name,
            userId: user._id,
            action: 'Excluir integração',
            message: 'Integração com o Mercado Livre excluida.',
          },
          session,
        )

        await session.commitTransaction()
        session.endSession()
        return res.status(201).json({ message: 'Integração excluída com sucesso!' })
      }

      if (!usuario.seller_id) {
        await session.abortTransaction()
        session.endSession()
        return res.status(501).json({
          erroCode: '501',
          erroType: 'server_error',
          message: [
            'Ocorreu um erro com essa integração. Por favor, contate o desenvolvedor.',
          ],
        })
      }

      const { token } = await IntegrationFunctions.refreshToken(
        usuario.refresh_token,
        usuario._id,
        session,
      )

      const USER_ID = usuario.seller_id
      const APP_ID = process.env.CLIENT_ID_ML

      const url = `https://api.mercadolibre.com/users/${USER_ID}/applications/${APP_ID}`
      const response = await axios.delete(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      await IntegracaoML.deleteOne({ _id: id }).session(session)

      await RandomFunctions.setLogs(
        Logs,
        {
          integration: usuario.name,
          integrationId: usuario._id,
          user: user.name,
          userId: user._id,
          action: 'Excluir integração',
          message: 'Integração com o Mercado Livre excluida.',
        },
        session,
      )

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

  static async changeCodeByToken(req, res) {
    const { code, state } = req.body
    const user = req.user

    try {
      const url = 'https://api.mercadolibre.com/oauth/token'

      const exists = await IntegracaoML.findOne({ _id: state })

      if (exists && exists.status !== 'wait_auth') {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: ['Ja existe uma integração ativa com essa conta !'],
        })
        return
      }

      const data = {
        grant_type: 'authorization_code',
        client_id: process.env.CLIENT_ID_ML,
        client_secret: process.env.CLIENT_SECRET_ML,
        code: code,
        redirect_uri: process.env.REDIRECT_URI_ML,
      }

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const retorno = response.data

      const integration = await IntegracaoML.findOneAndUpdate(
        { _id: state },
        {
          $set: {
            status: 'active',
            refresh_token: retorno.refresh_token,
            code: code,
            seller_id: retorno.user_id,
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
        message: 'Troca do Code por Refresh_Token no Mercado Livre',
      })

      res.status(201).json({ message: 'Integração realizada com sucesso !' })
    } catch (error) {
      try {
        const deletado = await IntegracaoML.findOne({ _id: state })

        if (deletado && deletado.status === 'wait_auth') {
          await IntegracaoML.deleteOne({ _id: state })
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

  static async getAllIntegrations(req, res) {
    try {
      const [
        integrations,
        integrationsGS,
        integrationsMGL,
        integrationsTiny,
        integrationsShopee,
      ] = await Promise.all([
        IntegracaoML.find({})
          .select('-code -refresh_token -seller_id -lastAccess_token')
          .sort({ order: 1 }),

        IntegracaoGS.find({}).select('-code').sort({ order: 1 }),
        IntegracaoMGL.find({}).select('-code').sort({ order: 1 }),
        IntegracaoTiny.find({}).select('-code').sort({ order: 1 }),
        IntegracaoShopee.find({}).select('-code').sort({ order: 1 }),
      ])

      const integrationsComTipo = integrations.map((i) => ({
        ...i.toObject(),
        tipo: 'mercado livre',
      }))

      integrationsGS.map((i) =>
        integrationsComTipo.push({
          ...i.toObject(),
          tipo: 'google sheets',
        }),
      )

      integrationsMGL.map((i) =>
        integrationsComTipo.push({
          ...i.toObject(),
          tipo: 'magalu',
        }),
      )

      integrationsTiny.map((i) =>
        integrationsComTipo.push({
          ...i.toObject(),
          tipo: 'tiny',
        }),
      )

      integrationsShopee.map((i) =>
        integrationsComTipo.push({
          ...i.toObject(),
          tipo: 'shopee',
        }),
      )

      integrationsComTipo.sort((a, b) => a.order - b.order)

      res.status(201).json(integrationsComTipo)
    } catch (error) {
      console.log(error)

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Ocorreu um erro ao tentar obter a lista de integrações. Por favor tente novamente!',
        ],
      })
    }
  }

  static async functionsOffIntegration(req, res) {
    try {
      const { action, id } = req.body
      const user = req.user

      if (action === 'ativar') {
        const atualizada = await IntegracaoML.updateOne(
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
          message: 'Ativou a integração com o Mercado Livre.',
        })
      }

      if (action === 'pausar') {
        const atualizada = await IntegracaoML.updateOne(
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
          message: 'Pausou a integração com o Mercado Livre.',
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

      if (int === 'tiny') {
        integration = await IntegracaoTiny.findOne({ _id: id }).select(
          '-code -refresh_token -seller_id -lastAccess_token',
        )
      }

      if (int === 'shopee') {
        integration = await IntegracaoShopee.findOne({ _id: id }).select(
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
    const user = req.user

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const original = await IntegracaoML.findById(id).session(session)

      if (!original) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'without_integration',
          message: ['Não foi encontrada nenhuma integração com esse id!'],
        })
      }

      const shortExists = await IntegracaoML.findOne({
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

      const updatedData = IntegrationFunctions.mapToSchemaFormat(updated)
      const changes = IntegrationFunctions.detectEditableChanges(
        original.toObject(),
        updatedData,
      )

      if (Object.keys(changes).length > 0) {
        await IntegracaoML.updateOne({ _id: id }, { $set: changes }, { session })
      }

      await RandomFunctions.setLogs(
        Logs,
        {
          integration: original.name,
          integrationId: original._id,
          user: user.name,
          userId: user._id,
          action: 'Atualizar integração',
          message: 'Atualizou a integração com o Mercado Livre.',
        },
        session,
      )

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

  static async getTabelaFrete(req, res) {
    try {
      const tabela = await Precificacao.findOne({ name: 'default' }).select('-_id')
      const novaTabela = tabela.toObject()
      for (const i of novaTabela.tabela_fretes_ml) {
        delete i._id
      }
      res.status(201).json(novaTabela)
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'update_error',
        message: ['Ocorreu um erro ao tentar obter a lista de fretes'],
      })
    }
  }

  static async updateTabelaFreteML(req, res) {
    const novaTabela = req.body.novaTabela
    const user = req.user

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      await Precificacao.findOneAndUpdate(
        { name: 'default' },
        { $unset: { tabela_fretes_ml: '' } },
        { session },
      )

      const precificacao = await Precificacao.findOneAndUpdate(
        { name: 'default' },
        { $set: { tabela_fretes_ml: novaTabela } },
        {
          returnDocument: 'after',
          session,
        },
      )

      await RandomFunctions.setLogs(
        Logs,
        {
          integration: precificacao.name,
          integrationId: precificacao._id,
          user: user.name,
          userId: user._id,
          action: 'Atualizar integração',
          message: 'Atualizou a integração com o Mercado Livre.',
          observacoes: [changes],
        },
        session,
      )

      await session.commitTransaction()

      session.endSession()

      return res.status(201).json(precificacao)
    } catch (error) {
      await session.abortTransaction()
      session.endSession()

      res.status(500).json({
        erroCode: '500',
        erroType: 'update_error',
        message: ['Ocorreu um erro ao tentar atualizar a tabela de fretes'],
      })
    }
  }

  static async getDisponibleOrders(req, res) {
    const { id } = req.query

    try {
      const [
        integracoesML,
        integracoesGS,
        integracoesMGL,
        integracoesTiny,
        integracoesShopee,
      ] = await Promise.all([
        IntegracaoML.find(),
        IntegracaoGS.find(),
        IntegracaoMGL.find(),
        IntegracaoTiny.find(),
        IntegracaoShopee.find(),
      ])

      const integracoes = [
        ...integracoesML,
        ...integracoesGS,
        ...integracoesMGL,
        ...integracoesTiny,
        ...integracoesShopee,
      ]

      let list_orders = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

      for (const i of integracoes) {
        if (i._id.toString() !== id.toString()) {
          const orderToRemove = Number.parseInt(i.order, 10)
          const index = list_orders.indexOf(orderToRemove)
          if (index !== -1) {
            list_orders.splice(index, 1)
          }
        }
      }

      list_orders = list_orders.map((item) => ({ value: item, name: item }))

      list_orders.push({ value: null, name: null })

      list_orders.sort((a, b) => {
        if (a.value === null) return -1
        if (b.value === null) return 1
        return 0
      })

      res.status(201).json({ list_orders })
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'update_error',
        message: [
          'Ocorreu um erro ao tentar obter as ordens disponíveis. Atualize a página e tente novamente !',
        ],
      })
    }
  }

  static async getTokenIntegration(req, res) {
    const { idInt, tipo } = req.body

    try {
      if (tipo === 'mercado livre') {
        const integracao = await IntegracaoML.findById(idInt)

        const access_token = await IntegrationFunctions.refreshToken(
          integracao.refresh_token,
          idInt,
        )

        const tokenExpireUtc = new Date(access_token.expires)

        const brasiliaOffsetMs = -3 * 60 * 60 * 1000
        const expireInBrasilia = new Date(tokenExpireUtc.getTime() + brasiliaOffsetMs)

        const extendedExpire = new Date(expireInBrasilia.getTime() + 6 * 60 * 60 * 1000)

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

        res.status(201).json({ token: access_token.token, expires: tempoFaltante })
        return
      }

      if (tipo === 'magalu') {
        const integracao = await IntegracaoMGL.findById(idInt)

        const access_token = await IntegrationFunctions.refreshTokenMagalu(
          integracao.refresh_token,
          idInt,
        )

        const tokenExpireUtc = new Date(access_token.expires)

        const brasiliaOffsetMs = -3 * 60 * 60 * 1000
        const expireInBrasilia = new Date(tokenExpireUtc.getTime() + brasiliaOffsetMs)

        const extendedExpire = new Date(expireInBrasilia.getTime() + 1.5 * 60 * 60 * 1000)

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

        res.status(201).json({ token: access_token.token, expires: tempoFaltante })
        return
      }

      if (tipo === 'tiny') {
        const integracao = await IntegracaoTiny.findById(idInt)

        const access_token = await IntegrationFunctions.refreshTokenTiny(
          integracao.refresh_token,
          idInt,
          integracao.clientId,
          integracao.clientSecret,
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

        res.status(201).json({ token: access_token.token, expires: tempoFaltante })
        return
      }

      if (tipo === 'shopee') {
        const access_token = await IntegrationFunctions.refreshTokenShopee(idInt)

        const tokenExpireUtc = new Date(access_token.expires)

        const brasiliaOffsetMs = -3 * 60 * 60 * 1000
        const expireInBrasilia = new Date(tokenExpireUtc.getTime() + brasiliaOffsetMs)

        const extendedExpire = new Date(expireInBrasilia.getTime() + 4 * 60 * 60 * 1000)

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

        res.status(201).json({ token: access_token.token, expires: tempoFaltante })
        return
      }
    } catch (error) {
      console.log('error: ', error)

      res.status(500).json({
        erroCode: '500',
        erroType: 'token_error',
        message: [
          'Ocorreu um erro ao tentar obter o token dessa integração. Por favor tente novamente mais tarde',
        ],
      })
    }
  }
}

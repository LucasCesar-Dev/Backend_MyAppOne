const axios = require('axios')
const IntegracaoMGL = require('../models/IntegracaoMGL')
const IntegracaoGS = require('../models/IntegracaoGS')
const IntegracaoML = require('../models/IntegracaoML')

const Precificacao = require('../models/Precificacao')
const mongoose = require('mongoose')
const IntegrationFunctions = require('../utils/IntegrationFunctions')

module.exports = class ApiMagaluController {
  static async getNewIntegration(req, res) {
    const { name, cnpj } = req.body

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

      const integrationExists = await IntegracaoMGL.findOne({
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

      const newIntegration = await IntegracaoMGL.create(
        [
          {
            name: name,
            status: 'wait_auth',
            short_name: `temporario-${name.trim().replace(' ', '')}`,
            order: 10,
            cnpj: cnpj,
          },
        ],
        {
          session,
        },
      )

      const newIntegrationId = newIntegration[0]._id.toString()

      await session.commitTransaction()
      session.endSession()

      const url = 'https://seller.magalu.com/integradoras/?search=myappone'

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
      // const exists = await IntegracaoMGL.findOne({ cnpj: state })

      // if (exists && exists.status !== 'wait_auth') {
      //   res.status(404).json({
      //     erroCode: '404',
      //     erroType: 'server_error',
      //     message: ['Ja existe uma integração ativa com essa conta !'],
      //   })
      //   return
      // }

      const url = 'https://id.magalu.com/oauth/token'
      const data = new URLSearchParams({
        grant_type: 'authorization_code',
        redirect_uri: process.env.REDIRECT_URI_MGL,
        client_id: process.env.CLIENT_ID_MGL,
        client_secret: process.env.CLIENT_SECRET_MGL,
        code: code,
      })

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const retorno = response.data

      const integration = await IntegracaoMGL.updateOne(
        { cnpj: state },
        {
          $set: {
            status: 'active',
            refresh_token: retorno.refresh_token,
            code: code,
            seller_id: retorno.user_id,
          },
        },
      )

      res.status(201).json({ message: 'Integração realizada com sucesso !' })
    } catch (error) {
      try {
        const deletado = await IntegracaoMGL.findOne({ cnpj: state })

        if (deletado && deletado.status === 'wait_auth') {
          await IntegracaoMGL.deleteOne({ cnpj: state })
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

      const integration = await IntegracaoMGL.findOne({
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

      const url = `https://id.magalu.com/login?client_id=${process.env.CLIENT_ID_MGL}&redirect_uri=${process.env.REDIRECT_URI_MGL}&scope=open:portfolio:read open:order-order:read open:portfolio-skus-seller:read&response_type=code&choose_tenants=true&state=${newIntegrationId}`

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
      const usuario = await IntegracaoMGL.findOne({ _id: id }).session(session)

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
        await IntegracaoMGL.deleteOne({ _id: id }).session(session)
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

      await IntegracaoMGL.deleteOne({ _id: id }).session(session)

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

  static async functionsOffIntegration(req, res) {
    try {
      const { action, id } = req.body

      if (action === 'ativar') {
        await IntegracaoMGL.updateOne(
          { _id: id },
          {
            $set: {
              status: 'active',
            },
          },
        )
      }

      if (action === 'pausar') {
        await IntegracaoMGL.updateOne(
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

  static async updateIntegration(req, res) {
    const { id, updated } = req.body

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const original = await IntegracaoMGL.findById(id).session(session)

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

      const updatedData = IntegrationFunctions.mapToSchemaFormat(updated)
      const changes = IntegrationFunctions.detectEditableChanges(
        original.toObject(),
        updatedData,
      )

      if (Object.keys(changes).length > 0) {
        await IntegracaoMGL.updateOne({ _id: id }, { $set: changes }, { session })
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

  static async getTabelaFrete(req, res) {
    try {
      const tabela = await Precificacao.findOne({ name: 'default' }).select('-_id')
      const novaTabela = tabela.toObject()
      for (const i of novaTabela.tabela_fretes_mgl) {
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

  static async updateTabelaFreteMGL(req, res) {
    const novaTabela = req.body.novaTabela

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      await Precificacao.findOneAndUpdate(
        { name: 'default' },
        { $unset: { tabela_fretes_mgl: '' } },
        { session },
      )

      const precificacao = await Precificacao.findOneAndUpdate(
        { name: 'default' },
        { $set: { tabela_fretes_mgl: novaTabela } },
        { new: true, session },
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
      const [integracoesML, integracoesGS] = await Promise.all([
        IntegracaoMGL.find(),
        IntegracaoGS.find(),
      ])

      const integracoes = [...integracoesML, ...integracoesGS]

      let list_orders = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

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

  static async getTokenMagalu(req, res) {
    const { secret } = req.body

    try {
      if (
        secret ===
        '8DEAC19F2CB45344AD64DCBFDE9AB40BD141974C4614E74AA480308DA22F9878612DE573C6282A7F3E9DAD15EB7F3EDE8880FDB8E008836EE8CC706864BA4BCF'
      ) {
        const integracao = await IntegracaoMGL.findById('6766b997458fa41e5cbf07ff')

        const access_token = await IntegrationFunctions.refreshTokenMagalu(
          integracao.refresh_token,
          '6766b997458fa41e5cbf07ff',
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

      return res.status(500).json({
        erroCode: '500',
        erroType: 'secret_error',
        message: ['O secret informado não corresponde ao do servidor !'],
      })
    } catch (error) {
      res.status(500).json({
        erroCode: '500',
        erroType: 'token_error',
        message: ['Ocorreu um erro ao tentar obter o token da Magalu.'],
      })
    }
  }
}

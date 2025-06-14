const axios = require('axios')
const qs = require('qs')
const crypto = require('node:crypto')

const IntegracaoML = require('../models/IntegracaoML')
const IntegracaoMGL = require('../models/IntegracaoMGL')
const IntegracaoTiny = require('../models/IntegracaoTiny')
const IntegracaoShopee = require('../models/IntegracaoShopee')

module.exports = class IntegrationFunctions {
  static async refreshToken(token, intId, session = false) {
    const client_id = process.env.CLIENT_ID_ML
    const client_secret = process.env.CLIENT_SECRET_ML
    const code = token
    const redirect_uri = process.env.REDIRECT_URI_ML

    const url = 'https://api.mercadolibre.com/oauth/token'

    let query = IntegracaoML.findOne({ _id: intId })
    if (session) {
      query = query.session(session)
    }
    let integration = await query

    integration = integration.toObject()

    if (
      integration.lastAccess_token?.token &&
      IntegrationFunctions.isTokenValid(
        integration.lastAccess_token,
        5.5 * 60 * 60 * 1000,
      )
    ) {
      return {
        token: integration.lastAccess_token.token,
        expires: integration.lastAccess_token.updateAt,
      }
    }

    // Dados a serem enviados na requisição
    const data = {
      grant_type: 'refresh_token',
      client_id: client_id,
      client_secret: client_secret,
      refresh_token: code,
      redirect_uri: redirect_uri,
    }

    try {
      const response = await axios.post(url, data, {
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
      })

      const dataExpires = new Date()

      let updateQuery = IntegracaoML.updateOne(
        { _id: intId },
        {
          $set: {
            'lastAccess_token.token': response.data.access_token,
            'lastAccess_token.updateAt': dataExpires,
          },
        },
      )

      if (session) {
        updateQuery = updateQuery.session(session)
      }

      await updateQuery

      return { token: response.data.access_token, expires: dataExpires }
    } catch (error) {
      // biome-ignore lint/complexity/noUselessCatch: <explanation>
      throw error
    }
  }

  static async refreshTokenMagalu(token, intId, session = false) {
    const client_id = process.env.CLIENT_ID_MGL
    const client_secret = process.env.CLIENT_SECRET_MGL
    const refresh_token = token

    const url = 'https://id.magalu.com/oauth/token'

    try {
      let query = IntegracaoMGL.findOne({ _id: intId })
      if (session) {
        query = query.session(session)
      }

      const integration = await query

      if (
        integration.lastAccess_token?.token &&
        IntegrationFunctions.isTokenValid(
          integration.lastAccess_token,
          1.5 * 60 * 60 * 1000,
        )
      ) {
        return {
          token: integration.lastAccess_token.token,
          expires: integration.lastAccess_token.updateAt,
        }
      }

      const data = qs.stringify({
        grant_type: 'refresh_token',
        client_id,
        client_secret,
        refresh_token,
      })

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const newAccessToken = response.data.access_token
      const dataExpires = new Date()

      let updateQuery = IntegracaoMGL.updateOne(
        { _id: intId },
        {
          $set: {
            refresh_token: response.data.refresh_token,
            'lastAccess_token.token': newAccessToken,
            'lastAccess_token.updateAt': dataExpires,
          },
        },
      )

      if (session) {
        updateQuery = updateQuery.session(session)
      }

      await updateQuery

      return {
        token: newAccessToken,
        expires: dataExpires,
      }
    } catch (error) {
      // biome-ignore lint/complexity/noUselessCatch: <explanation>
      throw error
    }
  }

  static async refreshTokenTiny(token, intId, client_id, client_secret, session = false) {
    const refresh_token = token

    const url = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token'

    try {
      let query = IntegracaoTiny.findOne({ _id: intId })
      if (session) {
        query = query.session(session)
      }

      const integration = await query

      if (
        integration.lastAccess_token?.token &&
        IntegrationFunctions.isTokenValid(
          integration.lastAccess_token,
          3 * 60 * 60 * 1000,
        )
      ) {
        return {
          token: integration.lastAccess_token.token,
          expires: integration.lastAccess_token.updateAt,
        }
      }

      const data = qs.stringify({
        grant_type: 'refresh_token',
        client_id,
        client_secret,
        refresh_token,
      })

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const newAccessToken = response.data.access_token
      const dataExpires = new Date()

      let updateQuery = IntegracaoTiny.updateOne(
        { _id: intId },
        {
          $set: {
            refresh_token: response.data.refresh_token,
            'lastAccess_token.token': newAccessToken,
            'lastAccess_token.updateAt': dataExpires,
          },
        },
      )

      if (session) {
        updateQuery = updateQuery.session(session)
      }

      await updateQuery

      return {
        token: newAccessToken,
        expires: dataExpires,
      }
    } catch (error) {
      // biome-ignore lint/complexity/noUselessCatch: <explanation>
      throw error
    }
  }

  static async refreshTokenShopee(intId, session = false) {
    try {
      let query = IntegracaoShopee.findOne({ _id: intId })
      if (session) {
        query = query.session(session)
      }

      const integration = await query

      if (
        integration.lastAccess_token?.token &&
        IntegrationFunctions.isTokenValid(
          integration.lastAccess_token,
          4 * 60 * 60 * 1000,
        )
      ) {
        return {
          token: integration.lastAccess_token.token,
          expires: integration.lastAccess_token.updateAt,
        }
      }

      const partnerId = decryptDataShopee(integration.partner_id)
      const partnerSecret = decryptDataShopee(integration.partner_key)
      const shop_id = integration.seller_id
      const refresh_token = integration.refresh_token

      const timestamp = Math.floor(Date.now() / 1000)
      const path = '/api/v2/auth/access_token/get'
      const base_string = `${partnerId}${path}${timestamp}`
      const sign = crypto
        .createHmac('sha256', partnerSecret)
        .update(base_string)
        .digest('hex')

      const url = `https://partner.shopeemobile.com${path}?partner_id=${Number(partnerId)}&timestamp=${timestamp}&sign=${sign}`

      const data = {
        refresh_token,
        shop_id: Number(shop_id),
        partnerId: Number(partnerId),
      }

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const dataExpires = new Date()

      let updateQuery = IntegracaoShopee.updateOne(
        { _id: intId },
        {
          $set: {
            refresh_token: response.data.refresh_token,
            'lastAccess_token.token': response.data.access_token,
            'lastAccess_token.updateAt': dataExpires,
          },
        },
      )

      if (session) {
        updateQuery = updateQuery.session(session)
      }

      await updateQuery

      return {
        token: response.data.access_token,
        expires: dataExpires,
      }
    } catch (error) {
      // biome-ignore lint/complexity/noUselessCatch: <explanation>
      throw error
    }
  }

  static mapToSchemaFormat(receivedData) {
    return {
      name: receivedData.name,
      short_name: receivedData.short_name,
      order: Number.parseInt(receivedData.order),
      configs: {
        precificacao: {
          activate: receivedData.activate === 'true',

          pause: receivedData.pause === 'true',
          replicate: receivedData.replicate === 'true',
          change_stock: receivedData.change_stock === 'true',
          default_stock: Number.parseInt(receivedData.default_stock) || 0,
          cents_bellow: receivedData.cents_bellow === 'true',
          default_cents: Number.parseFloat(receivedData.default_cents) || 0,
        },
        promocao: {
          id: receivedData.idPromo,
          type: receivedData.typePromo,
          percent: Number.parseFloat(receivedData.percent) || 0,
        },
      },
    }
  }

  static detectEditableChanges(original, updated) {
    const changes = {}
    const editableFields = [
      'name',
      'short_name',
      'order',
      'configs.precificacao',
      'configs.promocao',
    ]

    for (const key of editableFields) {
      const [mainKey, subKey] = key.split('.')

      if (subKey) {
        if (
          original[mainKey] &&
          original[mainKey][subKey] !== undefined &&
          updated[mainKey] &&
          updated[mainKey][subKey] !== undefined
        ) {
          if (original[mainKey][subKey] !== updated[mainKey][subKey]) {
            if (!changes[mainKey]) changes[mainKey] = {}
            changes[mainKey][subKey] = updated[mainKey][subKey]
          }
        } else if (updated[mainKey] && updated[mainKey][subKey] !== undefined) {
          if (!changes[mainKey]) changes[mainKey] = {}
          changes[mainKey][subKey] = updated[mainKey][subKey]
        }
      } else {
        if (original[mainKey] !== updated[mainKey]) {
          changes[mainKey] = updated[mainKey]
        }
      }
    }

    return changes
  }

  static isTokenValid(tokenInfo, END_TIME) {
    const now = new Date()

    const ageOfToken = now - tokenInfo.updateAt

    return !(ageOfToken > END_TIME)
  }

  static mapToSchemaGSFormat(receivedData) {
    return {
      name: receivedData.name,
      short_name: receivedData.short_name,
      order: Number.parseInt(receivedData.order),
      sheetId: receivedData.sheetId,
      tabela_relacionamento: {
        abaId: receivedData.abaId ? receivedData.abaId : false,
        timer: receivedData.timer ? receivedData.timer : 0,
        sku:
          receivedData.sku !== undefined && receivedData.sku !== null
            ? receivedData.sku
            : false,
        cost: receivedData.cost ? receivedData.cost : false,
        rm: receivedData.rm ? receivedData.rm : false,
        rmf: receivedData.rmf ? receivedData.rmf : false,
        searchForm: receivedData.searchForm ? receivedData.searchForm : false,
        comfirm: receivedData.comfirm ? receivedData.comfirm : false,
        catalog: receivedData.catalog ? receivedData.catalog : false,
        peso: receivedData.peso ? receivedData.peso : false,
      },
    }
  }

  static detectEditableChangesGS(original, updated) {
    const changes = {}
    const editableFields = [
      'name',
      'short_name',
      'order',
      'sheetId',
      'tabela_relacionamento',
    ]

    for (const key of editableFields) {
      const [mainKey, subKey] = key.split('.')

      if (subKey) {
        if (
          original[mainKey] &&
          original[mainKey][subKey] !== undefined &&
          updated[mainKey] &&
          updated[mainKey][subKey] !== undefined
        ) {
          if (original[mainKey][subKey] !== updated[mainKey][subKey]) {
            if (!changes[mainKey]) changes[mainKey] = {}
            changes[mainKey][subKey] = updated[mainKey][subKey]
          }
        } else if (updated[mainKey] && updated[mainKey][subKey] !== undefined) {
          if (!changes[mainKey]) changes[mainKey] = {}
          changes[mainKey][subKey] = updated[mainKey][subKey]
        }
      } else {
        if (original[mainKey] !== updated[mainKey]) {
          changes[mainKey] = updated[mainKey]
        }
      }
    }

    return changes
  }

  static async getNewTokens(callback = async () => null) {
    const integracoes = await IntegracaoML.find({})
    for (const integracao of integracoes) {
      await IntegrationFunctions.refreshToken(integracao.refresh_token, integracao._id)
    }
    await callback()
  }

  static async getNewTokensMagalu(callback = async () => null) {
    const integracoes = await IntegracaoMGL.find({})
    for (const integracao of integracoes) {
      await IntegrationFunctions.refreshTokenMagalu(
        integracao.refresh_token,
        integracao._id,
      )
    }
    await callback()
  }

  static async getNewTokensTiny(callback = async () => null) {
    const integracoes = await IntegracaoTiny.find({})
    for (const integracao of integracoes) {
      await IntegrationFunctions.refreshTokenTiny(
        integracao.refresh_token,
        integracao._id,
        integracao.clientId,
        integracao.clientSecret,
      )
    }
    await callback()
  }

  static mapToSchemaTinyFormat(receivedData) {
    return {
      name: receivedData.name,
      short_name: receivedData.short_name,
      order: Number.parseInt(receivedData.order),
      tokenApi_v2: receivedData.token_v2,
      configs: {
        compras: {
          permitirCompras: receivedData.permitirCompras === 'true',
          timerCompras: receivedData.timerCompras,
          ignorar: receivedData.ignorar,
          dataCompras: receivedData.dataCompras,
        },

        vendas: {
          permitirVendas: receivedData.permitirVendas === 'true',
          timerVendas: receivedData.timerVendas,
          dataVendas: receivedData.dataVendas,
          ignorar: receivedData.ignorarVendas,
        },

        transferencias: {
          permitirTransf: receivedData.permitirTransf === 'true',
          permitirOrigem: receivedData.permitirOrigem === 'true',
          integrationOrigem: receivedData.integrationOrigem,
          integrationTinyId: receivedData.integrationTinyId,
          emissionHour: Number.parseInt(receivedData.emissionHour) || null,
          qntItens: Number.parseInt(receivedData.qntItens) || null,
          incluirNota: receivedData.incluirNota,
          emitirNota: receivedData.emitirNota,
          importarNota: receivedData.importarNota,
          lancarEstoque: receivedData.lancarEstoque,
          natureza_operacao: receivedData.natureza_operacao,
          id_natureza_operacao:
            Number.parseInt(receivedData.id_natureza_operacao) || null,
          id_deposito: Number.parseInt(receivedData.id_deposito) || null,
          versao_api: receivedData.versao_api,
          codigo: receivedData.codigo,
          nameConta: receivedData.nameConta,
          tipoPessoa: receivedData.tipoPessoa,
          contribuinte: receivedData.contribuinte,
          cnpjConta: receivedData.cnpjConta,
          inscricao: receivedData.inscricao,
          cep: receivedData.cep,
          municipio: receivedData.municipio,
          estado: receivedData.estado,
          endereco: receivedData.endereco,
          bairro: receivedData.bairro,
          enderecoNro: receivedData.enderecoNro,
          complemento: receivedData.complemento,
          telefone: receivedData.telefone,
          email: receivedData.email,
        },

        produtos: {
          permitirCusto: receivedData.permitirCusto === 'true',
        },
      },
    }
  }

  static detectEditableChangesTiny(original, updated) {
    const changes = {}
    const editableFields = [
      'name',
      'short_name',
      'order',
      'tokenApi_v2',
      'configs.compras',
      'configs.vendas',
      'configs.transferencias',
      'configs.produtos',
    ]

    for (const key of editableFields) {
      const [mainKey, subKey] = key.split('.')

      if (subKey) {
        if (
          original[mainKey] &&
          original[mainKey][subKey] !== undefined &&
          updated[mainKey] &&
          updated[mainKey][subKey] !== undefined
        ) {
          if (original[mainKey][subKey] !== updated[mainKey][subKey]) {
            if (!changes[mainKey]) changes[mainKey] = {}
            changes[mainKey][subKey] = updated[mainKey][subKey]
          }
        } else if (updated[mainKey] && updated[mainKey][subKey] !== undefined) {
          if (!changes[mainKey]) changes[mainKey] = {}
          changes[mainKey][subKey] = updated[mainKey][subKey]
        }
      } else {
        if (original[mainKey] !== updated[mainKey]) {
          changes[mainKey] = updated[mainKey]
        }
      }
    }

    return changes
  }

  static mapToSchemaShopeeFormat(receivedData) {
    return {
      name: receivedData.name,
      short_name: receivedData.short_name,
      order: Number.parseInt(receivedData.order),
      permitirAPI: receivedData.access === 'true',
    }
  }

  static detectEditableChangesShopee(original, updated) {
    const changes = {}
    const editableFields = ['name', 'short_name', 'order', 'permitirAPI']

    for (const key of editableFields) {
      const [mainKey, subKey] = key.split('.')

      if (subKey) {
        if (
          original[mainKey] &&
          original[mainKey][subKey] !== undefined &&
          updated[mainKey] &&
          updated[mainKey][subKey] !== undefined
        ) {
          if (original[mainKey][subKey] !== updated[mainKey][subKey]) {
            if (!changes[mainKey]) changes[mainKey] = {}
            changes[mainKey][subKey] = updated[mainKey][subKey]
          }
        } else if (updated[mainKey] && updated[mainKey][subKey] !== undefined) {
          if (!changes[mainKey]) changes[mainKey] = {}
          changes[mainKey][subKey] = updated[mainKey][subKey]
        }
      } else {
        if (original[mainKey] !== updated[mainKey]) {
          changes[mainKey] = updated[mainKey]
        }
      }
    }

    return changes
  }
}

function decryptDataShopee(encryptedData) {
  const encryptionKey = process.env.SECRET_KEY_SHOPEE
  const algorithm = 'aes-256-cbc'

  const [ivHex, encrypted] = encryptedData.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const key = Buffer.from(encryptionKey, 'hex')

  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

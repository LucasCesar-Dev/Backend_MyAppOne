const User = require('../models/User')
const Register = require('../models/Register')
const Autorizados = require('../models/Autorizados')
const Negados = require('../models/Negados')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const createUserToken = require('../helpers/create-user-token')
const isTokenExpired = require('../helpers/is-token-valid')
const path = require('node:path')
const fs = require('node:fs')
const UserFunctions = require('../utils/UserFunctions')
const RandomFunctions = require('../utils/RandomFunctions')
const { deslogarUsuario } = require('../websocket/websocket')
const mongoose = require('../db/conn')

//const getToken = require('../helpers/get-token')

module.exports = class UserController {
  static async register(req, res) {
    const session = await mongoose.startSession()
    session.startTransaction()
    try {
      const { id, role, hourStart, hourEnd, products, picking, ecommerce } = req.body

      const newUser = await Register.findById(id).session(session)
      if (!newUser) {
        throw new Error('Usuário não encontrado')
      }

      const usuarioTest = { ...newUser._doc }
      delete usuarioTest._id
      delete usuarioTest.createdAt
      delete usuarioTest.updatedAt

      const prices_cost = []
      products.pricing === 'S' ? prices_cost.push('pricing') : ''
      products.productList === 'S' ? prices_cost.push('product') : ''
      products.productCreate === 'S' ? prices_cost.push('create') : ''
      products.productUpdate === 'S' ? prices_cost.push('edit') : ''
      products.salesReports === 'S' ? prices_cost.push('sales_reports') : ''

      const addressing = []
      picking.picking === 'S' ? addressing.push('picking') : ''
      picking.pickingMap === 'S' ? addressing.push('mapping') : ''

      const ecommerceList = []
      ecommerce.activePricing === 'S' ? ecommerceList.push('pricing') : ''
      ecommerce.melhoria === 'S' ? ecommerceList.push('improvement') : ''
      ecommerce.times === 'S' ? ecommerceList.push('time') : ''

      products.pricing === 'S' ? (products.pricing = true) : (products.pricing = false)
      products.productList === 'S'
        ? (products.productList = true)
        : (products.productList = false)
      products.productCreate === 'S'
        ? (products.productCreate = true)
        : (products.productCreate = false)
      products.productUpdate === 'S'
        ? (products.productUpdate = true)
        : (products.productUpdate = false)
      products.salesReports === 'S'
        ? (products.salesReports = true)
        : (products.salesReports = false)

      picking.picking === 'S' ? (picking.picking = true) : (picking.picking = false)
      picking.pickingMap === 'S'
        ? (picking.pickingMap = true)
        : (picking.pickingMap = false)

      ecommerce.activePricing === 'S'
        ? (ecommerce.activePricing = true)
        : (ecommerce.activePricing = false)
      ecommerce.melhoria === 'S'
        ? (ecommerce.melhoria = true)
        : (ecommerce.melhoria = false)
      ecommerce.times === 'S' ? (ecommerce.times = true) : (ecommerce.times = false)

      const settings = []
      if (role === 1 || role === 2) {
        settings.push('menu')
        settings.push('registers')
      }

      const user = await User.findOne({ email: newUser.email }).session(session)

      if (user) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'user_exists',
          message: ['Já existe um usuário cadastrado com esse e-mail !'],
        })
      }

      let userHole
      try {
        userHole = RandomFunctions.setRole(role)
      } catch (error) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'function_error',
          message: ['Por favor insira uma função válida.'],
        })
      }

      const novoUsuario = await User.create(
        [
          {
            photo: newUser.photo,
            name: newUser.name,
            birthday: newUser.birthday,
            phone: newUser.phone,
            role: userHole,
            roleNumber: role,
            hourStart: RandomFunctions.timeStringToMilliseconds(hourStart),
            hourEnd: RandomFunctions.timeStringToMilliseconds(hourEnd),
            permissions: {
              prices_cost,
              addressing,
              settings,
              ecommerce: ecommerceList,
            },
            email: newUser.email,
            password: newUser.password,
          },
        ],
        { session },
      )

      const dataAtual = new Date()
      const dataFormatada = `${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth() + 1).padStart(2, '0')}/${dataAtual.getFullYear()}`
      const horaFormatada = `${String(dataAtual.getHours()).padStart(2, '0')}:${String(dataAtual.getMinutes()).padStart(2, '0')}`

      const novoAutorizado = await Autorizados.create(
        [
          {
            photo: newUser.photo,
            name: newUser.name,
            birthday: newUser.birthday,
            phone: newUser.phone,
            role: userHole,
            roleNumber: role,
            hourStart: RandomFunctions.timeStringToMilliseconds(hourStart),
            hourEnd: RandomFunctions.timeStringToMilliseconds(hourEnd),
            products,
            picking,
            ecommerce,
            email: newUser.email,
            password: newUser.password,

            conclusao: `Usuário autorizado por ${req.user.name}, dia ${dataFormatada} às ${horaFormatada}`,
          },
        ],
        { session },
      )

      await Register.deleteOne({ _id: newUser._id }).session(session)

      await session.commitTransaction()
      session.endSession()

      res.status(201).json({ message: 'Novo usuário cadastrado com sucesso !' })
    } catch (error) {
      console.log('Error: ', error)
      await session.abortTransaction()
      session.endSession()
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações de cadastro do novo usuário. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async newRegister(req, res) {
    const session = await mongoose.startSession() // Iniciar sessão para a transação
    session.startTransaction() // Iniciar transação

    try {
      const {
        name,
        photo,
        birthday,
        phone,
        role,
        hourStart,
        hourEnd,
        products,
        picking,
        ecommerce,
        email,
        password,
        comfirmPassword,
      } = req.body

      // Verificar se o registro já existe
      const registerExists = await Register.findOne({ email: email }).session(session)
      if (registerExists) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'email_is_await_to_register',
          message: [
            'Esse email já existe e está aguardando ser aprovado para usar o sistema.',
          ],
        })
      }

      // Verificar se o usuário já existe
      const userExists = await User.findOne({ email: email }).session(session)
      if (userExists) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'email_is_register',
          message: [
            'Esse email já tem uma conta aprovada no sistema. Tente logar usando esse e-mail e a senha. Se não conseguir ou não se lembrar, contate um administrador.',
          ],
        })
      }

      // Verificar se as senhas coincidem
      if (password !== comfirmPassword) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'passwords_not_match',
          message: ['A senha e a confirmação de senha precisam ser iguais.'],
        })
      }

      // Processar a imagem
      const base64Data = photo.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      const fileName = `${Date.now()}-${name.split(' ')[0]}.jpg`
      const filePath = path.resolve(__dirname, '../public/images/users', fileName)

      fs.writeFile(filePath, buffer, async (err) => {
        if (err) {
          await session.abortTransaction()
          session.endSession()
          return res.status(500).json({
            erroCode: '500',
            erroType: 'image_error',
            message: ['Erro ao salvar a imagem.'],
          })
        }
      })

      // Definir o papel do usuário
      let userHole
      try {
        userHole = RandomFunctions.setRole(role)
      } catch (error) {
        await session.abortTransaction()
        session.endSession()
        return res.status(404).json({
          erroCode: '404',
          erroType: 'function_error',
          message: ['Por favor insira uma função válida.'],
        })
      }

      // Hash da senha
      const hashedPass = await UserFunctions.hashPassword(password)

      // Criar novo registro
      const newUser = await Register.create(
        [
          {
            name: name,
            birthday: new Date(birthday),
            photo: `${process.env.API}/images/users/${fileName}`,
            phone: phone,
            role: userHole,
            roleNumber: role,
            hourStart: RandomFunctions.timeStringToMilliseconds(hourStart),
            hourEnd: RandomFunctions.timeStringToMilliseconds(hourEnd),
            products: {
              pricing: products.pricing === 'S',
              productCreate: products.productCreate === 'S',
              productList: products.productList === 'S',
              productUpdate: products.productUpdate === 'S',
              salesReports: products.salesReports === 'S',
            },
            picking: {
              picking: picking.picking === 'S',
              pickingMap: picking.pickingMap === 'S',
            },
            ecommerce: {
              pricing: ecommerce.activePricing === 'S',
              melhoria: ecommerce.melhoria === 'S',
              times: ecommerce.times === 'S',
            },
            email: email,
            password: hashedPass,
          },
        ],
        { session }, // associar criação à transação
      )

      // Commitar a transação se tudo der certo
      await session.commitTransaction()
      session.endSession()

      res.status(200).json({ message: 'ok' })
    } catch (error) {
      console.log('Error: ', error)
      await session.abortTransaction()
      session.endSession()
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar registrar o novo usuário. Por favor tente novamente mais tarde.',
        ],
      })
    }
  }

  static async login(req, res) {
    const { email, password, forced } = req.body
    const user = await User.findOne({ email: email })

    if (!user) {
      const register = await Register.findOne({ email: email })
      if (register) {
        res.status(404).json({
          erroCode: '101',
          erroType: 'user_await_auth',
          message: ['O seu cadastro ainda está em análise'],
        })
        return
      }

      const negado = await Negados.findOne({ email: email })
      if (negado) {
        res.status(404).json({
          erroCode: '101',
          erroType: 'user_await_auth',
          message: ['O seu cadastro foi rejeitado. Solicite um novo cadastro'],
        })
        return
      }

      res.status(404).json({
        erroCode: '101',
        erroType: 'not_user_found',
        message: ['Usuário não encontrado.'],
      })
      return
    }

    const checkPassword = await bcrypt.compare(password, user.password)

    if (!checkPassword) {
      res.status(401).json({
        erroCode: '102',
        erroType: 'unauthorized',
        message: ['Credenciais inválidas'],
      })
      return
    }

    const hourStart = user.hourStart
    const hourEnd = user.hourEnd

    const currentDate = new Date()
    const currentTime =
      currentDate.getHours() * 3600000 +
      currentDate.getMinutes() * 60000 +
      currentDate.getSeconds() * 1000

    if (
      !(currentTime >= hourStart && currentTime <= hourEnd) &&
      user.roleNumber !== 1 &&
      user.roleNumber !== 2
    ) {
      res.status(401).json({
        erroCode: '102',
        erroType: 'unauthorized',
        message: [
          `Fora do seu horário de trabalho (${millisecondsToTime(hourStart)} a ${millisecondsToTime(hourEnd)})`,
        ],
      })
      return
    }

    const isValidToken = await isTokenExpired(user.session_token)
    if (user.session_token && !forced && isValidToken) {
      res.status(409).json({
        erroCode: '103',
        erroType: 'is_logged_already',
        message: ['O usuário está logado em outra máquina!'],
      })
      return
    }

    if (user.session_token && isValidToken) {
      deslogarUsuario(user.session_token)
    }

    const token = await createUserToken(user, false, '1d')

    await User.findOneAndUpdate({ email: email }, { session_token: token })

    const configToken = {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.AMBIENT === 'PRODUCTION',
      ...(process.env.AMBIENT === 'PRODUCTION' ? { sameSite: 'None' } : {}),
    }

    res.cookie('token', token, configToken)

    const userData = user.toObject()

    userData.password = undefined
    userData.session_token = undefined

    const AuthorizedToken = await createUserToken({
      _id: userData._id.toString(),
      name: userData.name,
    })
    userData._id = undefined
    userData.id = undefined

    const userToken = await createUserToken({}, userData)

    res
      .status(201)
      .json({ auth: true, user: userToken, authToken: AuthorizedToken })
      .end()
  }

  static async logout(req, res) {
    try {
      const myCookie = req.cookies.token

      const user = await User.findById(req.user._id.toString())

      if (myCookie === user.session_token) {
        await User.findByIdAndUpdate(req.user._id.toString(), {
          session_token: null,
        })
      }

      res.clearCookie('token', { httpOnly: true })
      res.status(201).json({ message: ['Usuário deslogado com sucesso !'] })
    } catch (error) {
      console.log('Error: ', error)
      res.status(404).json({
        erroCode: '104',
        erroType: 'server_failed',
        message: [
          'Ocorreu um problema ao efetuar o logout. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async checkIfUserAuthorized(req, res) {
    try {
      const token = req.cookies.token
      if (!token) {
        return res.status(401).json({
          erroCode: '105',
          erroType: 'no_token',
          message: ['Token não encontrado'],
        })
      }

      const user = await User.findOne({ session_token: token })

      if (!user) {
        return res.status(401).json({
          erroCode: '106',
          erroType: 'invalid_token',
          message: ['Token inválido'],
        })
      }

      const isValidToken = await isTokenExpired(user.session_token)
      if (user.session_token && !isValidToken) {
        res.status(404).json({
          erroCode: '107',
          erroType: 'token_has_expired',
          message: ['O token de segurança expirou. Por favor realize novamente o login.'],
        })
        return
      }

      const userData = user.toObject()

      userData.password = undefined
      userData.session_token = undefined

      const AuthorizedToken = await createUserToken({
        _id: userData._id.toString(),
        name: userData.name,
      })
      userData._id = undefined
      userData.id = undefined
      const userToken = await createUserToken({}, userData)

      res
        .status(201)
        .json({ auth: true, user: userToken, authToken: AuthorizedToken })
        .end()
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao verificar se o usuário está autorizado.. Deslogando por segurança.',
        ],
      })
    }
  }

  static async getCurrentUser(req, res) {
    const user = req.user

    res.status(200).json(user)
  }

  static async getListNewRegister(req, res) {
    const { tipo } = req.query

    let registros
    if (Number.parseInt(tipo) === 1) {
      registros = await Register.find()
    } else if (Number.parseInt(tipo) === 2) {
      registros = await Autorizados.find()
    } else if (Number.parseInt(tipo) === 3) {
      registros = await Negados.find()
    }

    return res.status(200).json(registros)
  }

  static async getNewRegisterById(req, res) {
    try {
      const { id, tipo } = req.query

      let registros
      if (Number.parseInt(tipo) === 1) {
        registros = await Register.findById(id)
      } else if (Number.parseInt(tipo) === 2) {
        registros = await Autorizados.findById(id)
      } else if (Number.parseInt(tipo) === 3) {
        registros = await Negados.findById(id)
      }

      if (!registros) {
        res.status(404).json({
          erroCode: '404',
          erroType: 'server_error',
          message: ['Usuário/Cadastro não encontrado'],
        })
        return
      }

      res.status(201).json(registros)
    } catch (error) {
      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: [
          'Houve um erro ao tentar obter as informações de cadastro do novo usuário. Por favor tente novamente mais tarde',
        ],
      })
    }
  }

  static async rejectNewRegister(req, res) {
    const id = req.body.id
    const session = await mongoose.startSession()

    try {
      session.startTransaction()

      const newUser = await Register.findById(id).session(session)

      console.log('newUser ', newUser)

      if (!newUser) {
        throw new Error('Usuário não encontrado')
      }

      const usuarioTest = { ...newUser._doc }
      usuarioTest.ecommerce.activePricing = usuarioTest.ecommerce.pricing
      delete usuarioTest._id
      delete usuarioTest.createdAt
      delete usuarioTest.updatedAt

      const dataAtual = new Date()
      const dataFormatada = `${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth() + 1).padStart(2, '0')}/${dataAtual.getFullYear()}`
      const horaFormatada = `${String(dataAtual.getHours()).padStart(2, '0')}:${String(dataAtual.getMinutes()).padStart(2, '0')}`

      const novoAutorizado = await Negados.create(
        [
          {
            ...usuarioTest,
            conclusao: `Usuário rejeitado por ${req.user.name}, dia ${dataFormatada} às ${horaFormatada}`,
          },
        ],
        { session },
      )

      await Register.deleteOne({ _id: newUser._id }).session(session)

      await session.commitTransaction()
      session.endSession()

      res.status(201).json({ message: 'Usuário rejeitado com sucesso!' })
    } catch (error) {
      console.log(error)

      await session.abortTransaction()
      session.endSession()

      res.status(404).json({
        erroCode: '404',
        erroType: 'server_error',
        message: ['Houve um erro ao tentar rejeitar o cadastro desse usuário.'],
      })
    }
  }
}

function millisecondsToTime(ms) {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

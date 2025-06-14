const User = require('../models/User')
const isTokenExpired = require('../helpers/is-token-valid')

const sessionGuard = async (req, res, next) => {
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
      message: [
        'O token de segurança expirou. Por favor realize novamente o login.',
      ],
    })
    return
  }

  req.user = user
  next()
}

module.exports = sessionGuard

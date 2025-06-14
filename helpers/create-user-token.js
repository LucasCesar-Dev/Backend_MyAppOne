const jwt = require('jsonwebtoken')

const getExpirationDate = () => {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0) // Próximo dia à meia-noite
  const expiresIn = Math.floor((midnight.getTime() - now.getTime()) / 1000) // Diferença em segundos
  return expiresIn
}

const createUserToken = async (user, data = false, expires = false) => {
  let payload = {
    name: user.name,
    id: user._id,
    timestamp: new Date().getTime(),
  }

  if (data) {
    payload = Object.assign(payload, data)
  }
  const token = jwt.sign(payload, process.env.JWT_TOKEN, {
    expiresIn: expires ? expires : getExpirationDate(),
  })

  return token
}

module.exports = createUserToken

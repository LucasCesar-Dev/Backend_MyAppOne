const jwt = require('jsonwebtoken')

function isTokenExpired(token) {
  try {
    const decodedToken = jwt.verify(token, process.env.JWT_TOKEN)
    return true
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return false
    }

    return false
  }
}

module.exports = isTokenExpired

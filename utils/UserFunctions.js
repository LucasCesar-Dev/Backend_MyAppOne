const bcrypt = require('bcrypt')

module.exports = class UserFunctions {
  static async hashPassword(password) {
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(password, saltRounds)
    return hashedPassword
  }
}

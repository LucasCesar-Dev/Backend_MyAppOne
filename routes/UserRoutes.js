const router = require('express').Router()
const UserControler = require('../controllers/UserController')
const User = require('../models/User')

//midlewares
const {
  userCreateValidation,
  loginValidation,
} = require('../middlewares/userValidations')
const validate = require('../middlewares/handleValidation')
const authGuard = require('../middlewares/authGuard')
const sessionGuard = require('../middlewares/sessionGuard')

router.post('/login', loginValidation(), validate, UserControler.login)

router.post('/logout', authGuard, UserControler.logout)
router.post('/check-if-users-authorized', UserControler.checkIfUserAuthorized)
router.post('/newregister', UserControler.newRegister)
router.post('/register', sessionGuard, UserControler.register)
router.post('/rejectnewregister', sessionGuard, UserControler.rejectNewRegister)

router.get(
  '/getlistnewregister',
  sessionGuard,
  UserControler.getListNewRegister,
)
router.get(
  '/getnewregisterbyid',
  sessionGuard,
  UserControler.getNewRegisterById,
)

module.exports = router

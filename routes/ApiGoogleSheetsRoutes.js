const router = require('express').Router()
const { ApiGoogleSheetsController } = require('../controllers/ApiGoogleSheetsController')
const sessionGuard = require('../middlewares/sessionGuard')

router.post(
  '/getnewintegration',
  sessionGuard,
  ApiGoogleSheetsController.getNewIntegration,
)

router.post(
  '/saveintegrationgs',
  sessionGuard,
  ApiGoogleSheetsController.saveIntegrationGS,
)

router.post(
  '/excluirintegracao',
  sessionGuard,
  ApiGoogleSheetsController.excluirIntegracao,
)

router.post(
  '/concluirintegration',
  sessionGuard,
  ApiGoogleSheetsController.concluirIntegration,
)

router.post(
  '/functionsoffintegration',
  sessionGuard,
  ApiGoogleSheetsController.functionsOffIntegration,
)

router.post('/getrowsheet', sessionGuard, ApiGoogleSheetsController.getRowSheet)

router.post(
  '/updateintegration',
  sessionGuard,
  ApiGoogleSheetsController.updateIntegration,
)

module.exports = router

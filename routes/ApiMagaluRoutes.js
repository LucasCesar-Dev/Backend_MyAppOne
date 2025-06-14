const router = require('express').Router()
const ApiMagaluController = require('../controllers/ApiMagaluController')
const sessionGuard = require('../middlewares/sessionGuard')

router.post('/getnewintegration', sessionGuard, ApiMagaluController.getNewIntegration)

router.post('/changecodebytoken', sessionGuard, ApiMagaluController.changeCodeByToken)

router.post(
  '/functionsoffintegration',
  sessionGuard,
  ApiMagaluController.functionsOffIntegration,
)

router.post('/concluirintegration', sessionGuard, ApiMagaluController.concluirIntegration)

router.post('/updateintegration', sessionGuard, ApiMagaluController.updateIntegration)

router.get('/gettabelafrete', sessionGuard, ApiMagaluController.getTabelaFrete)

router.post(
  '/updateTabelaFretemgl',
  sessionGuard,
  ApiMagaluController.updateTabelaFreteMGL,
)

router.post('/gettokenmagalu', ApiMagaluController.getTokenMagalu)

// router.get(
//   '/getallintegrations',
//   sessionGuard,
//   ApiMagaluController.getAllIntegrations,
// )

// router.post(
//   '/excluirintegracao',
//   sessionGuard,
//   ApiMagaluController.excluirIntegracao,
// )
// router.get(
//   '/getintegrationbyid',
//   sessionGuard,
//   ApiMagaluController.getIntegrationById,
// )

// router.get(
//   '/getdisponibleorders',
//   sessionGuard,
//   ApiMagaluController.getDisponibleOrders,
// )

module.exports = router

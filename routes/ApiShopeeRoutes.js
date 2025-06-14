const router = require('express').Router()
const ApiShopeeController = require('../controllers/ApiShopeeController')
const sessionGuard = require('../middlewares/sessionGuard')

router.post('/getnewintegration', sessionGuard, ApiShopeeController.getNewIntegration)

router.post('/changecodebytoken', sessionGuard, ApiShopeeController.changeCodeByToken)
// router.get(
//   '/getallintegrations',
//   sessionGuard,
//   ApiShopeeController.getAllIntegrations,
// )
router.post(
  '/functionsoffintegration',
  sessionGuard,
  ApiShopeeController.functionsOffIntegration,
)
router.post('/concluirintegration', sessionGuard, ApiShopeeController.concluirIntegration)
router.post('/excluirintegracao', sessionGuard, ApiShopeeController.excluirIntegracao)
router.post('/concluirexclusao', sessionGuard, ApiShopeeController.concluirExclusao)

// router.get(
//   '/getintegrationbyid',
//   sessionGuard,
//   ApiShopeeController.getIntegrationById,
// )
router.post('/updateintegration', sessionGuard, ApiShopeeController.updateIntegration)
router.get(
  '/generatesecretshopee',
  sessionGuard,
  ApiShopeeController.generateSecretShopee,
)

router.post('/gettokenshopee', ApiShopeeController.getTokenShopee)

// router.post(
//   '/updatetabelafreteml',
//   sessionGuard,
//   ApiShopeeController.updateTabelaFreteML,
// )

// router.get('/gettabelafrete', sessionGuard, ApiShopeeController.getTabelaFrete)

// router.get(
//   '/getdisponibleorders',
//   sessionGuard,
//   ApiShopeeController.getDisponibleOrders,
// )

// router.post(
//   '/gettokenintegration',
//   sessionGuard,
//   ApiShopeeController.getTokenIntegration,
// )

module.exports = router

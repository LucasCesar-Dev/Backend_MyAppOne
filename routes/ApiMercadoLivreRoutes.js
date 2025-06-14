const router = require('express').Router()
const ApiMercadoLivreController = require('../controllers/ApiMercadoLivreController')
const sessionGuard = require('../middlewares/sessionGuard')

router.post(
  '/getnewintegration',
  sessionGuard,
  ApiMercadoLivreController.getNewIntegration,
)
router.post(
  '/changecodebytoken',
  sessionGuard,
  ApiMercadoLivreController.changeCodeByToken,
)
router.get(
  '/getallintegrations',
  sessionGuard,
  ApiMercadoLivreController.getAllIntegrations,
)
router.post(
  '/functionsoffintegration',
  sessionGuard,
  ApiMercadoLivreController.functionsOffIntegration,
)
router.post(
  '/concluirintegration',
  sessionGuard,
  ApiMercadoLivreController.concluirIntegration,
)
router.post(
  '/excluirintegracao',
  sessionGuard,
  ApiMercadoLivreController.excluirIntegracao,
)
router.get(
  '/getintegrationbyid',
  sessionGuard,
  ApiMercadoLivreController.getIntegrationById,
)
router.post(
  '/updateintegration',
  sessionGuard,
  ApiMercadoLivreController.updateIntegration,
)
router.post(
  '/updatetabelafreteml',
  sessionGuard,
  ApiMercadoLivreController.updateTabelaFreteML,
)

router.get('/gettabelafrete', sessionGuard, ApiMercadoLivreController.getTabelaFrete)

router.get(
  '/getdisponibleorders',
  sessionGuard,
  ApiMercadoLivreController.getDisponibleOrders,
)

router.post(
  '/gettokenintegration',
  sessionGuard,
  ApiMercadoLivreController.getTokenIntegration,
)

module.exports = router

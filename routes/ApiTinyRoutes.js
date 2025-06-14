const router = require('express').Router()
const { ApiTinyController } = require('../controllers/ApiTinyController')
const sessionGuard = require('../middlewares/sessionGuard')

router.post('/getnewintegration', sessionGuard, ApiTinyController.getNewIntegration)
router.post('/changecodebytoken', sessionGuard, ApiTinyController.changeCodeByToken)
router.post('/excluirintegracao', sessionGuard, ApiTinyController.excluirIntegracao)
router.post(
  '/functionsoffintegration',
  sessionGuard,
  ApiTinyController.functionsOffIntegration,
)
router.post('/concluirintegration', sessionGuard, ApiTinyController.concluirIntegration)
router.post('/updateintegration', sessionGuard, ApiTinyController.updateIntegration)
router.post('/getfornecedoreslimit', sessionGuard, ApiTinyController.getFornecedoresLimit)
router.get('/getcompraswithparams', ApiTinyController.getComprasWithParams)
router.get('/getcomprasdetalhes', ApiTinyController.getComprasDetalhes)
router.get('/getallintegrationtiny', ApiTinyController.getAllIntegrationTiny)
router.post('/getdadosclientetiny', ApiTinyController.getDadosClienteTiny)
router.post('/getdadoscontatiny', ApiTinyController.getDadosContaTiny)

module.exports = router

const router = require('express').Router()
const EcommerceController = require('../controllers/EcommerceController')

//middlewares
const sessionGuard = require('../middlewares/sessionGuard')
const setTokens = require('../middlewares/setTokens')
const setPrecification = require('../middlewares/setPrecification')
const setIntegration = require('../middlewares/setIntegration')

router.get(
  '/obterprodutossimples',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.obterProdutosSimples,
)
router.get(
  '/obterkits',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.obterKits,
)
router.post(
  '/getproductswithparams',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.getProductsWithParams,
)
router.post('/getfreteml', sessionGuard, EcommerceController.getFreteML)
router.post('/getFretemgl', sessionGuard, EcommerceController.getFreteMGL)

router.post(
  '/getcomboswithparams',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.getCombosWithParams,
)
router.post(
  '/getkitswithparams',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.getKitsWithParams,
)

router.post(
  '/activatebysku',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.activateBySku,
)

router.post(
  '/activatebyskumagalu',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.activateBySkuMagalu,
)

router.post(
  '/precificarbysku',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.precificarBySku,
)

router.post(
  '/getnextcombowithparams',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.getNextComboWithParams,
)

router.post(
  '/getanuncioscontas',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.getAnunciosContas,
)

router.post(
  '/getinfoanuncios',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.getInfoAnuncios,
)

router.post(
  '/melhorarimagem',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.melhorarImagem,
)

router.post(
  '/removerfundo',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.removerFundo,
)

router.post(
  '/salvarimagem',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.salvarImagem,
)

router.post(
  '/conferirfotos',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.conferirFotos,
)

router.post(
  '/pauseallskus',
  sessionGuard,
  setTokens,
  setPrecification,
  // setIntegration,
  EcommerceController.pauseAllSkus,
)

router.post('/obterlogsbyid', sessionGuard, EcommerceController.obterLogsById)
router.post('/downloadlogsbyid', sessionGuard, EcommerceController.downloadLogsById)

module.exports = router

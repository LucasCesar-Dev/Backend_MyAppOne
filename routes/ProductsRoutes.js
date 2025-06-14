const router = require('express').Router()
const ProductsController = require('../controllers/ProductsController')

// ProductsController.enderecarByGtin(
//   { body: { ean: '7896006208914', endereco: 'B-01-CP-28' } },
//   {},
// )

//middlewares
const sessionGuard = require('../middlewares/sessionGuard')

router.post('/registerproduct', sessionGuard, ProductsController.RegisterProduct)
router.post('/registercombo', sessionGuard, ProductsController.RegisterCombo)
router.post('/registerkit', sessionGuard, ProductsController.RegisterKit)
router.post(
  '/getproductswithfilters',
  sessionGuard,
  ProductsController.getProductsWithFilters,
)
router.post(
  '/getcomboswithfilters',
  sessionGuard,
  ProductsController.getCombosWithFilters,
)
router.post('/getkitswithfilters', sessionGuard, ProductsController.getKitsWithFilters)
router.post('/getallwithfilters', sessionGuard, ProductsController.getAllWithFilters)
router.post('/gettinyproduct', sessionGuard, ProductsController.getProductTiny)
router.get('/getallbrands', sessionGuard, ProductsController.getAllBrands)
router.get('/getallcategorys', sessionGuard, ProductsController.getAllCategorys)
router.post('/addcategorybrand', sessionGuard, ProductsController.addCategoryBrand)
router.post('/getfather', sessionGuard, ProductsController.getFather)
router.post('/getproductbyid', sessionGuard, ProductsController.getProductById)
router.post('/getcombobyid', sessionGuard, ProductsController.getComboById)
router.post('/getkitbyid', sessionGuard, ProductsController.getKitById)
router.post('/updateproduct', sessionGuard, ProductsController.UpdateProduct)
router.post('/updatecombo', sessionGuard, ProductsController.UpdateCombo)
router.post('/updatekit', sessionGuard, ProductsController.UpdateKit)
router.post('/deleteproduct', sessionGuard, ProductsController.deleteProduct)
router.post('/deletekitcombo', sessionGuard, ProductsController.deleteKitCombo)
router.post('/getproductbyean', sessionGuard, ProductsController.getProductByEAN)
router.get(
  '/getproductsforpricing',
  sessionGuard,
  ProductsController.getProductsForPricing,
)
router.post('/checklocalisempty', sessionGuard, ProductsController.checkLocalIsEmpty)
router.post('/getemptyaddressbyia', sessionGuard, ProductsController.getEmptyAddressByIa)
router.post('/conference', sessionGuard, ProductsController.conference)
router.post('/enderecarbygtin', sessionGuard, ProductsController.enderecarByGtin)
router.post('/deleteaddress', sessionGuard, ProductsController.deleteAddress)
router.post('/changeaddress', sessionGuard, ProductsController.changeAddress)
router.post('/changeaddressshelf', sessionGuard, ProductsController.changeAddressShelf)
router.post('/addressbyia', sessionGuard, ProductsController.addressByIa)
router.post('/tryaddressunique', sessionGuard, ProductsController.tryAddressUnique)
router.get(
  '/getcolumnswithfilters',
  sessionGuard,
  ProductsController.getColumnsWithFilters,
)
router.get('/getitemscaixapreta', sessionGuard, ProductsController.getItemsCaixaPreta)
router.post(
  '/deleteaddressproduct',
  sessionGuard,
  ProductsController.deleteAddressProduct,
)
router.post(
  '/invertetravaenderecos',
  sessionGuard,
  ProductsController.inverteTravaEnderecos,
)
router.post('/changelimitaddress', sessionGuard, ProductsController.changeLimitAddress)
router.post(
  '/deletedisplayaddress',
  sessionGuard,
  ProductsController.deleteDisplayAddress,
)
router.post('/addnewdisplay', sessionGuard, ProductsController.addNewDisplay)
router.post('/addnewcollum', sessionGuard, ProductsController.addNewCollum)
router.post('/deletecollumaddress', sessionGuard, ProductsController.deleteCollumAddress)
router.post('/cleancollumaddress', sessionGuard, ProductsController.cleanCollumAddress)

router.post('/addtimepreco', sessionGuard, ProductsController.addTimePreco)
router.post('/removetimepreco', sessionGuard, ProductsController.removeTimePreco)
router.post(
  '/getproductswithfilterstime',
  sessionGuard,
  ProductsController.getProductsWithFiltersTime,
)
router.post('/removetimeprecobyid', sessionGuard, ProductsController.removeTimePrecoById)
router.post('/adddesmembopt', sessionGuard, ProductsController.addDesmembOpt)
router.get('/getdesmembopt', sessionGuard, ProductsController.getDesmembOpt)
router.post('/getprodutoslimit', sessionGuard, ProductsController.getProdutosLimit)
router.post(
  '/getcompraswithfilters',
  sessionGuard,
  ProductsController.getComprasWithFilters,
)
router.post(
  '/getvendaswithfilters',
  sessionGuard,
  ProductsController.getVendasWithFilters,
)

module.exports = router

const User = require('../models/User')
const jwt = require('jsonwebtoken')

const authGuard = async(req,res,next)=>{

    const authHeader = req.headers.authorization
    const token = authHeader?.split(' ')[1]  

    if(!token) return res.status(401).json({errors: ["Acesso negado!"]})
  
    try {

        const verified = jwt.verify(token, process.env.JWT_TOKEN)
        
        req.user = await User.findById(verified.id).select('-password')
        next()
        
    } catch (error) {
         res.status(401).json({errors: ["Token inválido."]})
    }

}


module.exports = authGuard
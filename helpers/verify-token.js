const jwt = require('jsonwebtoken')
const getToken = require('./get-token')

const checkToken = (req,res,next) =>{

    if(!req.headers.authorization){
        return res.status(401).json({message: 'Acesso negado!'})
    }

    const token = getToken(req)

    if(!token){
        return res.status(401).json({message: 'Acesso negado!'})
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_TOKEN)

        req.user = verified
        next()

    } catch (error) {
        return res.status(400).json({message: 'Token inválido!'})
    }

}


module.exports = checkToken
const mongoose = require('mongoose')

async function main() {
  const uri = `mongodb://${process.env.MONGOUSER}:${encodeURIComponent(process.env.MONGOPASS)}@${process.env.MONGOURL}/${process.env.MONGOBASE}?authSource=admin&replicaSet=rs0&readPreference=primary&directConnection=true`
  //const uri = `mongodb://${process.env.MONGOUSER}:${encodeURIComponent(process.env.MONGOPASS)}${process.env.MONGOURL}/${process.env.MONGOBASE}?authSource=admin&replicaSet=rs0`
  await mongoose.connect(uri)
  console.log('Conectou ao mongoose')
}

main().catch((err) => console.log('err: ', err))

module.exports = mongoose

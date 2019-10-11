const fs = require('fs')
const path = require('path')

fs.readdirSync(__dirname).forEach(fileName => {
  if (fileName.substr(-3) === '.js' && fileName !== 'index.js') {
    module.exports[fileName.split('.')[0]] = require(path.join(__dirname, fileName))
  }
})

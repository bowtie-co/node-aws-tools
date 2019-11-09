const os = require('os')
const fs = require('fs')
const path = require('path')

const info = {
  cwd: process.cwd(),
  pkg: require(path.join(__dirname, '..', 'package')),
  os: {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    type: os.type()
  },
  user: os.userInfo(),
  context: {},
  installPath: path.join(__dirname, '..')
}

const files = fs.readdirSync(info.cwd)

files.forEach(file => {
  if (/dockerfile/i.test(file)) {
    info.context.docker = true
  }

  if (/docker-compose\.ya?ml/i.test(file)) {
    info.context.dockerCompose = true
  }

  if (/gemfile/i.test(file)) {
    info.context.rails = true
  }

  if (/package\.json/i.test(file)) {
    info.context.node = true
    info.context.pkg = require(path.join(info.cwd, file))
  }

  if (/makefile/i.test(file)) {
    info.context.make = true
    info.context.makefile = fs.readFileSync(file)
  }
})

module.exports = info

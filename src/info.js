const os = require('os')
const fs = require('fs')

const info = {
  cwd: process.cwd(),
  os: {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    type: os.type()
  },
  user: os.userInfo(),
  context: {}
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
  }

  if (/makefile/i.test(file)) {
    info.context.make = true
    info.context.makefile = fs.readFileSync(file)
  }
})

module.exports = info

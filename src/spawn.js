const spawn = require('child_process').spawnSync

var cleanExit = function () { process.exit() }

process.on('SIGINT', cleanExit) // catch ctrl-c
process.on('SIGTERM', cleanExit) // catch kill

module.exports = ({ cli, cmd, args, env }) => {
  const opts = {
    stdio: 'inherit',
    env: Object.assign({}, process.env, env)
  }

  cli.warn(`Running command: ${cmd} ${args.join(' ')}`)

  const res = spawn(cmd, args, opts)

  if (res.error) {
    cli.error(res.error)
  }

  const msg = `command "${cmd} ${args.join(' ')}" exited with code ${res.status}`

  if (res.status !== 0) {
    cli.warn(msg)
  } else {
    cli.debug(msg)
  }
}

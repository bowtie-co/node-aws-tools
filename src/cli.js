const Cmr1Cli = require('cmr1-cli')
const actions = require('./actions')
const pkg = require('../package')
const info = require('./info')

const { makeHelpers } = require('./helpers')

let cli

const additionalOptions = [
  {
    name: 'action',
    alias: 'a',
    type: String,
    multiple: true,
    defaultOption: true,
    description: 'Action to take',
    typeLabel: Object.keys(actions).map(a => `[underline]{${a}}`).join('|')
  },
  {
    name: 'service',
    alias: 's',
    type: String,
    description: 'ECS service name (or ARN)',
    typeLabel: '[underline]{service}'
  },
  {
    name: 'cluster',
    alias: 'c',
    type: String,
    description: 'ECS cluster name (or ARN)',
    typeLabel: '[underline]{cluster}'
  },
  {
    name: 'region',
    alias: 'r',
    type: String,
    description: 'AWS region',
    typeLabel: '[underline]{region}'
  }
]

const isMakeable = (action) => {
  const targetRegExp = new RegExp(`^${action}:`, 'm')

  return info.context.make && targetRegExp.test(info.context.makefile)
}

const handleAction = (args) => {
  const action = args.shift()

  cli.debug(`Finding action: ${action}`)
  cli.debug('Available actions:', JSON.stringify(Object.keys(actions), null, 2))

  if (isMakeable(action)) {
    cli.log(`Delegating action to Makefile: ${action}`)

    args.unshift(action)

    actions.make.run({
      cli,
      info,
      args
    })
  } else if (!actions[action]) {
    cli.warn(`Action: '${action}' is invalid`)
    cli.showHelp()
  } else {
    cli.log(`Running action: ${action}`)

    if (typeof actions[action].run === 'function') {
      actions[action].run({
        cli,
        info,
        args,
        helpers: makeHelpers(cli, args)
      })
    } else {
      cli.warn(`Action: '${action}' is invalid`)
      cli.showHelp()
    }
  }
}

module.exports = {
  actions,
  handleAction,
  cli,
  pkg,
  load: () => {
    cli = new Cmr1Cli({
      name: pkg.name,
      version: pkg.version,
      description: `${pkg.description}  [[italic]{${pkg.author}}]`,
      helpSections: {
        actions: Object.keys(actions).map(a => actions[a].description ? `${a} - [italic]{${actions[a].description}}` : a),
        usage: [
          'aws-tools [underline]{action} [[italic]{args}...] [[italic]{options}...]',
          'aws-tools -a [underline]{action} [[italic]{args}...] [[italic]{options}...]',
          'aws-tools --action [underline]{action} [[italic]{args}...] [[italic]{options}...]'
        ],
        examples: [].concat.apply([], Object.keys(actions).map(a => actions[a].examples ? [ `[bold]{[underline]{${a}}}` ].concat(actions[a].examples, [ '' ]) : []))
      },
      helpHeader: 'Available Options',
      optionDefinitions: additionalOptions
    })

    return { cli, actions }
  },
  run: () => {
    cli.debug('Running with options:')
    cli.debug(JSON.stringify(cli.options, null, 2))
    cli.debug('System Information:')
    cli.debug(JSON.stringify(info, null, 2))

    if (cli.options.action && cli.options.action.length > 0) {
      handleAction(cli.options.action)
    } else {
      cli.warn('Missing action!')
      cli.showHelp()
    }
  }
}

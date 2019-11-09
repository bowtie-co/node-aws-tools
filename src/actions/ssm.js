const AWS = require('aws-sdk')
const path = require('path')
const async = require('async')

const pkg = require(path.join(__dirname, '..', '..', 'package.json'))

const ecs = new AWS.ECS()
const ec2 = new AWS.EC2()
const ssm = new AWS.SSM()

const run = ({ cli, info, args, env }) => {
  const validateArgFn = (input) => (input && input.trim() !== '')

  const getArg = (index, prompt, defaultValue = null, validateFn = validateArgFn) => {
    if (defaultValue) {
      prompt += '(optional) '
    }

    const val = args[index] || cli.prompt(prompt)

    if (typeof validateFn !== 'function') {
      cli.warn('Invalid validateFn supplied to getArg()')
      validateFn = validateArgFn
    }

    if (validateFn(val)) {
      return val
    } else {
      cli.warn(`Invalid arg:`, index, prompt)
    }

    return defaultValue
  }

  const getSsmAction = () => {
    return getArg(0, 'SSM Action (ls|new|get|rm): ').toLowerCase()
  }

  const getParamName = () => {
    return getArg(1, 'Parameter Name: ', null, (name) => /^[a-zA-Z0-9_\.\-]+$/.test(name))
  }

  const getParamValue = () => {
    return getArg(2, 'Parameter Value: ')
  }

  const getParamDesc = () => {
    return getArg(3, 'Parameter Description: ', `Created by ${pkg.name}@${pkg.version}`)
  }

  const action = getSsmAction()

  let name, value, description

  switch (action) {
    case 'ls':
    case 'all':
    case 'list':
      ssm.describeParameters({
        MaxResults: 50,
        Filters: [
          {
            Key: 'Type',
            Values: [
              'SecureString'
            ]
          }
        ]
      }, (err, data) => {
        if (err) {
          cli.warn(err.message || err)
        } else {
          const { Parameters } = data

          const paramList = Parameters.map(param => param.Name)

          cli.success('Available secure parameters:', JSON.stringify(paramList, null, 2))
        }
      })

      break
    case 'new':
    case 'add':
    case 'set':
    case 'make':
    case 'create':
    case 'update':
      // TODO: Support additional params for create? (AllowedPattern, KeyId, Policies, Tags, Tier)
      name = getParamName()
      value = getParamValue()
      description = getParamDesc()

      cli.log(`Adding new secure parameter:`, { [name]: value }, { description })

      ssm.putParameter({
        Name: name,
        Type: 'SecureString', // Allow as arg/option? 'String' | 'StringList',
        Description: description,
        Overwrite: !!cli.options.force,
        Value: value
      }, (err, data) => {
        if (err) {
          cli.warn(err.message || err)

          if (err.message && /parameter already exists/.test(err.message)) {
            cli.warn('Use --force option to enable secure parameter updates (overwriting)')
          }
        } else {
          cli.success(`Created  secure parameter: [version: ${data.Version}]`)
          cli.success({
            [name]: value
          })
          cli.success({
            description
          })
        }
      })
      break
    case 'get':
    case 'show':
    case 'view':
    case 'load':
      name = getParamName()

      cli.log(`Looking for secure parameter: '${name}'`)

      ssm.getParameter({
        Name: name, /* required */
        WithDecryption: true
      }, (err, data) => {
        if (err) {
          cli.warn(err.message || err)
        } else {
          const { Parameter } = data

          cli.success(`Found secure parameter: [version: ${Parameter.Version} | arn: ${Parameter.ARN}]`)
          cli.success({
            [Parameter.Name]: Parameter.Value
          })
        }
      })
      break
    case 'rm':
    case 'del':
    case 'delete':
    case 'remove':
    case 'destroy':
      name = getParamName()

      if (!cli.confirm(`Destroying parameter: '${name}' cannot be undone! Are you sure? `)) {
        cli.warn(`Not destroying parameter: '${name}'`)
      } else {
        ssm.deleteParameter({
          Name: name /* required */
        }, (err, data) => {
          if (err) {
            cli.warn(err.message || err)
          } else {
            cli.success(`Destroyed secure parameter: '${name}'`)
          }
        })
      }

      break
    default:
      cli.warn(`Unknown SSM action: '${action}'`)
      break
  }
}

module.exports = {
  run,
  description: 'Manage SSM SecureString Parameters',
  examples: [
    'aws-tools ssm [ACTION] [NAME] [VALUE] [DESC]',
    'aws-tools ssm list',
    'aws-tools ssm get ExistingSecret',
    'aws-tools ssm add NewSecret "abc-123"',
    'aws-tools ssm add AnotherSecret "secret" "Database password"',
    'aws-rools ssm rm AnotherSecret'
  ]
}

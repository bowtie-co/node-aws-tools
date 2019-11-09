const AWS = require('aws-sdk')
const async = require('async')

const ecs = new AWS.ECS()
const ec2 = new AWS.EC2()
const ssm = new AWS.SSM()

const run = ({ cli, info, args, env }) => {
  if (args.length > 0) {
    const action = args[0].toLowerCase()
    let name, value, params

    switch (action) {
      case 'ls':
      case 'all':
      case 'list':
        params = {
          MaxResults: 50,
          Filters: [
            {
              Key: 'Type',
              Values: [
                'SecureString'
              ]
            }
          ]
        }

        ssm.describeParameters(params, (err, data) => {
          if (err) {
            cli.error(err)
          }

          const { Parameters } = data

          const paramList = Parameters.map(param => param.Name)

          cli.success('Secure params:', JSON.stringify(paramList, null, 2))
        });

        break
      case 'new':
      case 'add':
      case 'make':
      case 'create':
        if (args.length === 1) {
          cli.error('Missing param name')
        }

        name = args[1]

        if (!/^[a-zA-Z0-9_\.\-]+$/.test(name)) {
          cli.error(`Invalid param name: '${name}'`)
        }

        if (args.length > 2) {
          value = args[2]

          cli.log(`Adding new param named: '${name}' with value: '${value}'`)

          const params = {
            Name: name,
            Type: 'SecureString', // Allow as arg/option? 'String' | 'StringList',
            Description: args[3] || 'Created by: @bowtie/aws-tools', // Allow as arg/option?
            Value: value
          }

          ssm.putParameter(params, (err, data) => {
            if (err) {
              cli.error(err)
            }

            cli.success(`Created secure param: ${name}=${value} [version: ${data.Version}]`)
            cli.success({
              [name]: value
            })
          });
        } else {
          cli.error('Not enough args')
        }
        break
      case 'get':
      case 'show':
      case 'view':
      case 'load':
        if (args.length === 1) {
          cli.error('Missing param name')
        }

        name = args[1]

        if (!/^[a-zA-Z0-9_\.\-]+$/.test(name)) {
          cli.error(`Invalid param name: '${name}'`)
        }

        cli.log(`Looking for param named: '${name}'`)

        params = {
          Name: name, /* required */
          WithDecryption: true
        };

        ssm.getParameter(params, (err, data) => {
          if (err) {
            cli.error(err)
          }

          const { Parameter } = data

          cli.success(`Secure param: ${Parameter.Name}=${Parameter.Value} [version: ${Parameter.Version} | arn: ${Parameter.ARN}]`)
          cli.success({
            [Parameter.Name]: Parameter.Value
          })
        });
        break
      case 'rm':
      case 'delete':
      case 'remove':
      case 'destroy':
        if (args.length === 1) {
          cli.error('Missing param name')
        }

        name = args[1]

        if (!/^[a-zA-Z0-9_\.\-]+$/.test(name)) {
          cli.error(`Invalid param name: '${name}'`)
        }

        if (!cli.confirm(`Are you sure you want to destroy the secure param: ${name}`)) {
          cli.error('ABORT')
        }

        params = {
          Name: name /* required */
        }

        ssm.deleteParameter(params, (err, data) => {
          if (err) {
            cli.error(err)
          }

          cli.success(`Secure param destroyed: ${name}`)
        })

        break
      default:
        cli.error(`Unknown SSM action: '${action}'`)
        break
    }
  } else {
    cli.error('Missing SSM action')
  }
}

module.exports = {
  run,
  description: 'Find EC2 instance(s) where ECS service is running',
  examples: [
    'aws-tools ssm ACTION [NAME] [VALUE] [DESC]',
    'aws-tools ssm list',
    'aws-tools ssm get ExistingSecret',
    'aws-tools ssm add NewSecret "abc-123"',
    'aws-tools ssm add AnotherSecret "secret" "Database password"'
  ]
}

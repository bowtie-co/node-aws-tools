const AWS = require('aws-sdk')
const async = require('async')
const { resources } = require('@bowtie/sls')

const deployStack = (stack, region, deployment) => {
  return new Promise(
    (resolve, reject) => {
      const cloudFormation = new AWS.CloudFormation({ region })

      // Filter current stack parameters except for "Tag"
      const params = stack.Parameters.map(p => {
        return {
          ParameterKey: p.ParameterKey,
          UsePreviousValue: true
        }
      }).filter(p => p.ParameterKey !== 'Tag')

      // Add the "Tag" parameter with the tag as specified by the parsed service parameters
      params.push({
        ParameterKey: 'Tag',
        ParameterValue: deployment.tag
      })

      // Update the CloudFormation stack with the reconstructed parameters
      cloudFormation.updateStack({
        // Get the stack name from the parsed service parameters
        StackName: deployment.stack,

        // Should include all previous parameters, and an updated "Tag" parameter
        Parameters: params,

        // Reuse the previous stack template
        UsePreviousTemplate: true,

        // A stack that creates/changes IAM roles/policies/etc MUST provide this capability flag
        Capabilities: [ 'CAPABILITY_IAM' ]
      }, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(data)
        }
      })
    }
  )
}

const stackContext = (StackName, region) => {
  return new Promise(
    (resolve, reject) => {
      if (!StackName || StackName.trim() === '') {
        reject(new Error('Missing stack name'))
        return
      }

      const cloudFormation = new AWS.CloudFormation({ region })

      cloudFormation.describeStacks({ StackName }, (stackError, stackData) => {
        if (stackError) {
          reject(stackError)
          return
        }

        if (!stackData.Stacks || stackData.Stacks.length !== 1) {
          reject(new Error(`Unable to find stack: '${StackName}'`))
          return
        }

        resolve(stackData.Stacks[0])
      })
    }
  )
}
const serviceContext = (options) => {
  return new Promise(
    async (resolve, reject) => {
      const { service, region } = options

      if (!service || service.trim() === '') {
        reject(new Error('Missing service name'))
        return
      }

      const serviceStack = await stackContext(`sls-ci-${service}-dev`, region)

      const serviceEndpoint = serviceStack.Outputs.find(output => output.OutputKey === 'ServiceEndpoint')

      if (!serviceEndpoint) {
        reject(new Error(`Unable to find ServiceEndpoint output from stack: '${StackName}'`))
        return
      }

      const apiConfig = {
        root: serviceEndpoint.OutputValue,
        prefix: 'api',
        version: 'v1'
      }

      const { Build, Deploy } = resources

      Build.apiConfig = apiConfig
      Deploy.apiConfig = apiConfig

      resolve({
        apiConfig,
        service,
        region,
        serviceStack,
        serviceEndpoint,
        Build,
        Deploy
      })
    }
  )
}

const run = async ({ cli, info, args, env, helpers }) => {
  const { pkg } = info
  const { getArg } = helpers

  try {
    const { service, region, Build, Deploy } = await serviceContext(cli.options)

    const getServiceAction = () => {
      return getArg(0, 'Service Action (builds|deploys|update): ').toLowerCase()
    }

    const getStackName = () => {
      return getArg(1, `Stack Name: ${service}-`, null, (name) => /^[a-zA-Z0-9_\-]+$/.test(name))
    }

    const getVersionTag = () => {
      return getArg(2, 'Version Tag: ', null, (tag) => /^[a-zA-Z0-9_\-]+$/.test(tag))
    }

    // const getParamDesc = () => {
    //   return getArg(3, 'Parameter Description: ', `Created by ${pkg.name}@${pkg.version}`)
    // }

    let stackName, version, description

    const action = getServiceAction()

    cli.log('Loading builds ...')
    const builds = await Build.all()
    cli.log('Loading deployments ...')
    const deploys = await Deploy.all()
    const stacks = {}

    deploys.forEach(deploy => {
      if (!stacks[deploy.stack]) {
        stacks[deploy.stack] = deploy
      }
    })

    cli.debug(stacks)

    switch (action) {
      case 'ls':
      case 'ls':
      case 'all':
      case 'list':
      case 'deploys':
        cli.debug(deploys)

        Object.keys(stacks).forEach(stackName => {
          const deploy = stacks[stackName]
          cli.success(`${stackName} (${deploy.tag})`)
        })

        break
      case 'builds':
        cli.debug(builds)

        builds.forEach(build => {
          cli.success(`Build #${build.build_number} [${build.build_status}]`)
        })

        break
      case 'update':
      case 'deploy':
        stackName = `${service}-${getStackName()}`
        tag = getVersionTag()

        cli.log(stackName)

        const targetStacks = Object.keys(stacks).filter(stack => stack.indexOf(stackName) === 0)

        if (targetStacks.length === 0)  {
          cli.warn(`No target(s) found for stack name: '${stackName}'`)
          return
        }

        if (cli.confirm(`Deploy tag: '${tag}' to stack(s): ${targetStacks.join(', ')}?`) || cli.options.force) {
          cli.log(`Deploying: '${tag}' to: ${targetStacks.join(', ')}`)

          const deploys = []

          for (let i = 0; i < targetStacks.length; i++) {
            const stack = targetStacks[i]
            const stackData = await stackContext(stack, region)
            const stackDeploy = stacks[stack]
            const stackTagParam = stackData.Parameters.find(param => param.ParameterKey === 'Tag')

            if (!stackTagParam) {
              cli.warn(`Missing/invalid stack param: 'Tag' on stack: ${stack}`)
            } else if (stackTagParam.ParameterValue === tag) {
              cli.warn(`No change for stack: ${stack} (already '${tag}')`)
            } else {
              deploys.push({
                tag,
                stack,
                stackData,
                stackDeploy,
                service_name: service,
                deploy_timestamp: Date.now()
              })
            }
          }

          if (deploys.length > 0) {
            async.each(deploys, (deploy, next) => {
              deployStack(deploy.stackData, region, deploy).then(async (data) => {
                cli.debug('Updated stack', data)

                delete deploy.stackData
                delete deploy.stackDeploy

                deploy.deploy_status = 'IN_PROGRESS'

                const newDeploy = await Deploy.create(deploy)

                cli.debug(newDeploy)

                const checkStatus = async () => {
                  const stackData = await stackContext(deploy.stack, region)

                  cli.debug(stackData)

                  if (/_COMPLETE$/.test(stackData.StackStatus)) {
                    const deploy_status = stackData.StackStatus === 'UPDATE_COMPLETE' ? 'SUCCEEDED': 'FAILED'

                    await newDeploy.update({ deploy_status })

                    cli.success(`[${stackData.StackStatus}] - ${deploy.stack} (${deploy.tag})`)

                    next()
                  } else {
                    cli.warn(`[${stackData.StackStatus}] - ${deploy.stack} (${deploy.tag})`)
                    setTimeout(checkStatus, 5000)
                  }
                }

                setTimeout(checkStatus, 5000)
              }).catch(next)
            }, err => {
              if (err) {
                cli.warn(err.message || err)
              } else {
                cli.success('Finished')
              }
            })
          } else {
            cli.warn('Not deploying anything')
          }
        }

        break
      default:
        cli.warn(`Unknown service action: '${action}'`)
        break
    }
  } catch (err) {
    cli.warn(err.message || err)
    cli.showHelp()
  }
}

module.exports = {
  run,
  description: 'Manage Services',
  examples: [
    'aws-tools service [ACTION] [[STACK]] [[TAG]]',
    'aws-tools service builds',
    'aws-tools service deploys',
    'aws-tools service update',
    'aws-tools service update example-app',
    'aws-tools service update example-app latest',
  ]
}

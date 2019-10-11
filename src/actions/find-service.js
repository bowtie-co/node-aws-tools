const AWS = require('aws-sdk')
const async = require('async')

const ecs = new AWS.ECS()
const ec2 = new AWS.EC2()

const run = ({ cli, info, args, env }) => {
  if (!cli.options.service || cli.options.service.trim() === '') {
    cli.warn('Missing service name (or ARN)')
    cli.showHelp()
  }

  const defaultOptions = {
    maxResults: 100
  }

  const serviceInstances = {}

  ecs.listClusters(defaultOptions, (clusterError, clusterData) => {
    if (clusterError) {
      cli.error(clusterError)
    }

    if (clusterData && clusterData.clusterArns) {
      cli.debug(`Found ${clusterData.clusterArns.length} ECS clusters`)

      let clusters = clusterData.clusterArns

      if (cli.options.cluster) {
        clusters = clusters.filter(cluster => cluster.indexOf(cli.options.cluster) !== -1)
      }

      cli.debug(`Searching clusters`, clusters)

      async.each(clusters, (cluster, nextCluster) => {
        cli.debug('Looking up services for cluster', cluster)

        ecs.listServices(Object.assign({}, defaultOptions, { cluster }), (serviceError, serviceData) => {
          if (serviceError) {
            cli.warn('Service Error looking up services for cluster', cluster)
            return nextCluster(serviceError)
          }

          cli.debug(`Found ${serviceData.serviceArns.length} ECS services running on cluster: ${cluster}`)

          if (serviceData && serviceData.serviceArns) {
            const services = serviceData.serviceArns.filter(service => service.indexOf(cli.options.service) !== -1)

            cli.debug(`Matching services:`, services)

            async.each(services, (serviceName, nextService) => {
              cli.debug('Looking up tasks for service', serviceName)

              const desiredStatus = 'RUNNING'

              serviceInstances[serviceName] = {
                cluster,
                runningTaskCount: 0,
                instanceCount: 0,
                instances: []
              }

              ecs.listTasks(Object.assign({}, defaultOptions, { cluster, serviceName, desiredStatus }), (tasksError, tasksData) => {
                if (tasksError) {
                  cli.warn('Tasks Error looking up services for cluster', cluster)
                  return nextService(tasksError)
                }

                if (tasksData && tasksData.taskArns && tasksData.taskArns.length > 0) {
                  cli.debug(`Found ${tasksData.taskArns.length} tasks running for service: ${serviceName}`)

                  serviceInstances[serviceName]['runningTaskCount'] = tasksData.taskArns.length

                  ecs.describeTasks({ cluster, tasks: tasksData.taskArns }, (taskDetailsError, taskDetailsData) => {
                    if (taskDetailsError) {
                      return nextService(taskDetailsError)
                    }

                    const containerInstances = []

                    taskDetailsData.tasks.forEach(task => {
                      if (!containerInstances.includes(task.containerInstanceArn)) {
                        containerInstances.push(task.containerInstanceArn)
                      }
                    })

                    serviceInstances[serviceName]['instanceCount'] = containerInstances.length

                    ecs.describeContainerInstances({ cluster, containerInstances }, (containerInstanceError, containerInstanceData) => {
                      if (containerInstanceError) {
                        return nextService(containerInstanceError)
                      }

                      if (containerInstanceData && containerInstanceData.containerInstances && containerInstanceData.containerInstances.length > 0) {
                        cli.debug(`Found ${containerInstanceData.containerInstances.length} EC2 instances for service: ${serviceName}`)

                        const InstanceIds = containerInstanceData.containerInstances.map(ci => ci.ec2InstanceId)

                        ec2.describeInstances({ InstanceIds }, (instancesError, instancesData) => {
                          if (instancesError) {
                            return nextService(instancesError)
                          }

                          if (instancesData && instancesData.Reservations) {
                            const resultData = []

                            instancesData.Reservations.forEach(reservation => {
                              reservation.Instances.forEach(instance => {
                                const { InstanceId, InstanceType, KeyName, LaunchTime, Placement, PublicIpAddress, PrivateIpAddress, Tags } = instance
                                const { AvailabilityZone } = Placement
                                const nameTag = Tags.find(tag => tag.Key === 'Name')
                                const Name = nameTag ? nameTag.Value : 'No Name'

                                resultData.push({
                                  Name,
                                  InstanceId,
                                  InstanceType,
                                  KeyName,
                                  LaunchTime,
                                  AvailabilityZone,
                                  PublicIpAddress,
                                  PrivateIpAddress
                                })
                              })
                            })

                            serviceInstances[serviceName]['instances'] = resultData

                            cli.log(`Found service: '${serviceName}' running on ${resultData.length} instance(s):`)
                          }

                          nextService()
                        })
                      }
                    })
                  })
                } else {
                  nextService()
                }
              })
            }, (serviceEachError) => {
              if (serviceEachError) {
                return nextCluster(serviceEachError)
              }

              nextCluster()
            })
          } else {
            cli.warn('Missing serviceData or serviceData.serviceArns!')

            nextCluster()
          }
        })
      }, (clusterEachError) => {
        if (clusterEachError) {
          cli.error(clusterEachError)
        }

        if (Object.keys(serviceInstances).length > 0) {
          cli.success(JSON.stringify(serviceInstances, null, 2))
        } else {
          cli.warn(`Unable to find service: ${cli.options.service}`)
        }

        cli.success('Done!')
      })
    }
  })
}

module.exports = {
  run,
  description: 'Find EC2 instance(s) where ECS service is running',
  examples: [
    'aws-tools find-service -s my-ecs-service',
    'aws-tools find-service -s my-ecs-service -c my-specific-cluster',
    'aws-tools find-service --service my-ecs-service',
    'aws-tools find-service --service my-ecs-service --cluster my-specific-cluster'
  ]
}

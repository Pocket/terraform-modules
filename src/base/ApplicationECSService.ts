import { ecs, ecr, cloudwatch, vpc, elb } from '@cdktf/provider-aws';
import { Resource } from '@cdktf/provider-null';
import { Construct } from 'constructs';
import { ApplicationECR, ECRProps } from './ApplicationECR';
import { ApplicationECSIAM, ApplicationECSIAMProps } from './ApplicationECSIAM';
import {
  ApplicationECSContainerDefinitionProps,
  buildDefinitionJSON,
} from './ApplicationECSContainerDefinition';
import { ApplicationTargetGroup } from './ApplicationTargetGroup';
import { ApplicationECSAlbCodeDeploy } from './ApplicationECSAlbCodeDeploy';
import { TerraformResource } from 'cdktf';
import { truncateString } from '../utilities';
import { File } from '@cdktf/provider-local';

const defaultRegion = 'us-east-1';

export interface ApplicationECSServiceProps {
  prefix: string;
  region?: string;
  shortName: string;
  tags?: { [key: string]: string };
  ecsClusterArn: string;
  ecsClusterName: string;
  vpcId: string;
  albConfig?: {
    containerPort: number;
    containerName: string;
    healthCheckPath: string;
    albSecurityGroupId: string;
    listenerArn: string;
  };
  containerConfigs: ApplicationECSContainerDefinitionProps[];
  privateSubnetIds: string[];
  cpu?: number; // defaults to 512
  memory?: number; // defaults to   2048
  launchType?: string; // defaults to 'FARGATE'
  deploymentMinimumHealthyPercent?: number; // defaults to 100
  deploymentMaximumPercent?: number; // defaults to 200
  desiredCount?: number; // defaults to 2
  lifecycleIgnoreChanges?: string[]; // defaults to ['task_definition', 'desired_count', 'load_balancer']
  ecsIamConfig: ApplicationECSIAMProps;
  useCodeDeploy: boolean; //defaults to true
  useCodePipeline?: boolean;
  notifyOnStarted?: boolean; //defaults to true
  notifyOnSucceeded?: boolean; //defaults to true
  notifyOnFailed?: boolean; //defaults to true
  codeDeploySnsNotificationTopicArn?: string;
}

interface ECSTaskDefinitionResponse {
  taskDef: ecs.EcsTaskDefinition;
  ecrRepos: ecr.EcrRepository[];
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationECSService extends Resource {
  public readonly service: ecs.EcsService;
  public readonly ecsSecurityGroup: vpc.SecurityGroup;
  public readonly mainTargetGroup?: ApplicationTargetGroup;
  public readonly codeDeployApp?: ApplicationECSAlbCodeDeploy;
  private readonly config: ApplicationECSServiceProps;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSServiceProps
  ) {
    super(scope, name);

    // populate defaults for some values if not provided
    this.config = ApplicationECSService.hydrateConfig(config);

    // set default region
    this.config.region = this.config.region ?? defaultRegion;

    this.ecsSecurityGroup = this.setupECSSecurityGroups();
    const { taskDef, ecrRepos } = this.setupECSTaskDefinition();

    //Setup an array of resources that the ecs service will need to depend on
    const ecsServiceDependsOn: TerraformResource[] = [...ecrRepos];

    const ecsNetworkConfig: ecs.EcsServiceNetworkConfiguration = {
      securityGroups: [this.ecsSecurityGroup.id],
      subnets: config.privateSubnetIds,
    };

    const ecsLoadBalancerConfig: ecs.EcsServiceLoadBalancer[] = [];

    const targetGroupNames: string[] = [];

    // If we have a alb configuration lets add it.
    if (config.albConfig) {
      this.mainTargetGroup = this.createTargetGroup('blue');
      ecsServiceDependsOn.push(this.mainTargetGroup.targetGroup);
      // Now that we have our service created, we append the alb listener rule to our HTTPS listener.
      const listenerRule = new elb.AlbListenerRule(this, 'listener_rule', {
        listenerArn: this.config.albConfig.listenerArn,
        priority: 1,
        condition: [
          {
            pathPattern: { values: ['*'] },
          },
        ],
        action: [
          {
            type: 'forward',
            targetGroupArn: this.mainTargetGroup.targetGroup.arn,
          },
        ],
        lifecycle: {
          ignoreChanges: ['action'],
        },
      });
      ecsServiceDependsOn.push(listenerRule);
      targetGroupNames.push(this.mainTargetGroup.targetGroup.name);
      ecsLoadBalancerConfig.push({
        containerName: config.albConfig.containerName,
        containerPort: config.albConfig.containerPort,
        targetGroupArn: this.mainTargetGroup.targetGroup.arn,
      });
    }

    //create ecs service
    this.service = new ecs.EcsService(this, 'ecs-service', {
      name: `${this.config.prefix}`,
      taskDefinition: taskDef.arn,
      deploymentController: this.config.useCodeDeploy
        ? { type: 'CODE_DEPLOY' }
        : { type: 'ECS' },
      launchType: this.config.launchType,
      deploymentMinimumHealthyPercent:
        this.config.deploymentMinimumHealthyPercent,
      deploymentMaximumPercent: this.config.deploymentMaximumPercent,
      desiredCount: this.config.desiredCount,
      cluster: this.config.ecsClusterArn,
      loadBalancer: ecsLoadBalancerConfig,
      networkConfiguration: ecsNetworkConfig,
      propagateTags: 'SERVICE',
      lifecycle: {
        ignoreChanges: this.config.lifecycleIgnoreChanges,
      },
      tags: this.config.tags,
      dependsOn: ecsServiceDependsOn,
    });

    if (this.config.useCodeDeploy && this.config.albConfig) {
      //Setup a second target group
      const greenTargetGroup = this.createTargetGroup('green');
      targetGroupNames.push(greenTargetGroup.targetGroup.name);
      //Setup codedeploy
      const codeDeployApp = (this.codeDeployApp =
        new ApplicationECSAlbCodeDeploy(this, 'ecs_codedeploy', {
          prefix: this.config.prefix,
          serviceName: this.service.name,
          clusterName: this.config.ecsClusterName,
          targetGroupNames: targetGroupNames,
          listenerArn: this.config.albConfig.listenerArn,
          snsNotificationTopicArn:
            this.config.codeDeploySnsNotificationTopicArn,
          tags: this.config.tags,
          dependsOn: [this.service],
          notifyOnStarted: this.config.notifyOnStarted,
          notifyOnSucceeded: this.config.notifyOnSucceeded,
          notifyOnFailed: this.config.notifyOnFailed,
        }));

      if (!this.config.useCodePipeline) {
        /**
         * If you make any changes to the Task Definition this must be called since we ignore changes to it.
         *
         * We typically ignore changes to the following since we rely on BlueGreen Deployments:
         * ALB Default Action Target Group ARN
         * ECS Service LoadBalancer Config
         * ECS Task Definition
         * ECS Placement Strategy Config
         */
        const nullECSTaskUpdate = new Resource(this, 'update-task-definition', {
          triggers: { task_arn: taskDef.arn },
          dependsOn: [
            taskDef,
            codeDeployApp.codeDeployApp,
            codeDeployApp.codeDeployDeploymentGroup,
          ],
        });

        nullECSTaskUpdate.addOverride(
          'provisioner.local-exec.command',
          `export app_spec_content_string='{"version":1,"Resources":[{"TargetService":{"Type":"AWS::ECS::Service","Properties":{"TaskDefinition":"${taskDef.arn}","LoadBalancerInfo":{"ContainerName":"${this.config.albConfig.containerName}","ContainerPort":${this.config.albConfig.containerPort}}}}}]}' && export revision="revisionType=AppSpecContent,appSpecContent={content='$app_spec_content_string'}" && aws --region ${this.config.region} deploy create-deployment  --application-name="${codeDeployApp.codeDeployApp.name}"  --deployment-group-name="${codeDeployApp.codeDeployDeploymentGroup.deploymentGroupName}" --description="Triggered from Terraform/CodeBuild due to a task definition update" --revision="$revision"`
        );
      }

      // We always create the appspec and taskdef files as long as we have an albConfig
      if (config.albConfig) {
        this.generateAppSpecAndTaskDefFiles(taskDef, config);
      }
    }

    // NEXT STEPS:

    // https://getpocket.atlassian.net/browse/BACK-411
    // build in autoscaling
  }

  // set defaults on optional properties
  private static hydrateConfig(
    config: ApplicationECSServiceProps
  ): ApplicationECSServiceProps {
    config.launchType = config.launchType || 'FARGATE';
    config.deploymentMinimumHealthyPercent =
      config.deploymentMinimumHealthyPercent || 100;
    config.deploymentMaximumPercent = config.deploymentMaximumPercent || 200;
    config.desiredCount = config.desiredCount || 2;
    //Need to use ?? because useCodeDeploy can be false
    config.useCodeDeploy = config.useCodeDeploy ?? true;

    config.lifecycleIgnoreChanges = config.lifecycleIgnoreChanges || [
      'desired_count',
      'load_balancer',
    ];
    if (config.useCodeDeploy) {
      // If we are using CodeDeploy then we need to ignore the task_definition change
      config.lifecycleIgnoreChanges.push('task_definition');
      config.lifecycleIgnoreChanges = [
        // De-dupe array
        ...new Set(config.lifecycleIgnoreChanges),
      ];
    }
    config.cpu = config.cpu || 512;
    config.memory = config.memory || 2048;

    return config;
  }

  /**
   * When running ECS Blue/Green CodeDeploy through CodePipeline, the configuration requires that
   * appspec.json and taskdef.json files exist within the source artifact.
   * This function creates those files as part of the terraform stack
   * @param taskDef
   * @param config
   * @private
   */
  private generateAppSpecAndTaskDefFiles(
    taskDef: ecs.EcsTaskDefinition,
    config: ApplicationECSServiceProps
  ) {
    const nullCreateTaskDef = new Resource(
      this,
      'create-task-definition-file',
      {
        triggers: {
          // Sets this null resorce to be triggered on every terraform apply
          alwaysRun: '${timestamp()}',
        },
        dependsOn: [taskDef],
      }
    );
    // There is no way to pull the task def from the output of the terraform resource.
    // Instead of trying to build a task def ourselves we use a null resource to access the recent version
    // in AWS AFTER we have created our new one.
    // It is also incredibly silly that AWS Codepipeline requires a task definition because it is already getting the
    // Task definition ARN in the app spec file. But you know. Amazon is amazon and we must obey the law.
    nullCreateTaskDef.addOverride(
      'provisioner.local-exec.command',
      `aws --region ${this.config.region} ecs describe-task-definition --task-definition ${taskDef.family} --query 'taskDefinition' >> taskdef.json`
    );

    new File(this, 'appspec', {
      content: JSON.stringify({
        version: 1,
        Resources: [
          {
            TargetService: {
              Type: 'AWS::ECS::Service',
              Properties: {
                TaskDefinition: taskDef.arn,
                LoadBalancerInfo: {
                  ContainerName: config.albConfig.containerName,
                  ContainerPort: config.albConfig.containerPort,
                },
              },
            },
          },
        ],
      }),
      filename: 'appspec.json',
    });
  }

  /**
   * Sets up the required ECS Security Groups
   * @private
   */
  private setupECSSecurityGroups(): vpc.SecurityGroup {
    let ingress: vpc.SecurityGroupIngress[] = [];
    if (this.config.albConfig) {
      ingress = [
        {
          fromPort: 80,
          protocol: 'TCP',
          toPort: this.config.albConfig.containerPort,
          securityGroups: [this.config.albConfig.albSecurityGroupId],
          description: 'required',
          cidrBlocks: [],
          ipv6CidrBlocks: [],
          prefixListIds: [],
          // @ts-ignore: https://github.com/hashicorp/terraform-cdk/issues/282
          self: false,
        },
      ];
    }

    const egress: vpc.SecurityGroupEgress[] = [
      {
        fromPort: 0,
        protocol: '-1',
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
        description: 'required',
        ipv6CidrBlocks: [],
        prefixListIds: [],
        securityGroups: [],
        // @ts-ignore: https://github.com/hashicorp/terraform-cdk/issues/282
        self: false,
      },
    ];

    return new vpc.SecurityGroup(this, `ecs_security_group`, {
      namePrefix: `${this.config.prefix}-ECSSecurityGroup`,
      description: 'Internal ECS Security Group (Managed by Terraform)',
      vpcId: this.config.vpcId,
      ingress,
      egress,
      tags: this.config.tags,
      lifecycle: {
        createBeforeDestroy: true,
      },
    });
  }

  /**
   * Setup the ECS Task Definition
   * @private
   */
  private setupECSTaskDefinition(): ECSTaskDefinitionResponse {
    const ecrRepos: ecr.EcrRepository[] = [];

    const containerDefs = [];
    // Set of unique volumes by volume name
    const volumes: { [key: string]: ecs.EcsTaskDefinitionVolume } = {};

    // figure out if we need to create an ECR for each container definition
    // also build a container definition JSON for each container
    this.config.containerConfigs.forEach((def) => {
      // if an image has been given, it must already live somewhere, so an ECR isn't needed
      if (!def.containerImage) {
        const ecrConfig: ECRProps = {
          name: `${this.config.prefix}-${def.name}`.toLowerCase(),
          tags: this.config.tags,
        };

        const ecr = new ApplicationECR(this, `ecr-${def.name}`, ecrConfig);
        //Set the image to the latest one for now
        def.containerImage = `${ecr.repo.repositoryUrl}:latest`;
        //The task and service need to depend on the repository existing.
        ecrRepos.push(ecr.repo);
      }

      // if a log group was given, it must already exist so we don't need to create it
      if (!def.logGroup) {
        const cloudwatchLogGroup = new cloudwatch.CloudwatchLogGroup(
          this,
          `ecs-${def.name}`,
          {
            namePrefix: `/ecs/${this.config.prefix}/${def.name}`,
            retentionInDays: 30,
            tags: this.config.tags,
          }
        );
        def.logGroup = cloudwatchLogGroup.name;
        def.logGroupRegion = this.config.region;
      }

      if (def.mountPoints) {
        def.mountPoints.forEach((mountPoint) => {
          // We currently only set the volume names, but more configuration is available in EcsTaskDefinitionVolume.
          volumes[mountPoint.sourceVolume] = { name: mountPoint.sourceVolume };
        });
      }

      containerDefs.push(buildDefinitionJSON(def));
    });

    const ecsIam = new ApplicationECSIAM(this, 'ecs-iam', {
      prefix: this.config.prefix,
      tags: this.config.tags,
      taskExecutionDefaultAttachmentArn:
        this.config.ecsIamConfig.taskExecutionDefaultAttachmentArn,
      taskExecutionRolePolicyStatements:
        this.config.ecsIamConfig.taskExecutionRolePolicyStatements,
      taskRolePolicyStatements:
        this.config.ecsIamConfig.taskRolePolicyStatements,
    });

    //Create task definition
    const taskDef = new ecs.EcsTaskDefinition(this, 'ecs-task', {
      // why are container definitions just JSON? can we get a real construct? sheesh.
      containerDefinitions: `[${containerDefs}]`,
      family: `${this.config.prefix}`,
      executionRoleArn: ecsIam.taskExecutionRoleArn,
      taskRoleArn: ecsIam.taskRoleArn,
      cpu: this.config.cpu.toString(),
      memory: this.config.memory.toString(),
      requiresCompatibilities: ['FARGATE'],
      networkMode: 'awsvpc',
      volume: Object.values(volumes),
      tags: this.config.tags,
      dependsOn: ecrRepos,
    });

    return { taskDef, ecrRepos };
  }

  /**
   * Helper function to get a target group
   * @private
   */
  private createTargetGroup(name: string): ApplicationTargetGroup {
    return new ApplicationTargetGroup(this, `${name}_target_group`, {
      shortName: truncateString(`${this.config.shortName}${name}`, 6),
      vpcId: this.config.vpcId,
      healthCheckPath: this.config.albConfig.healthCheckPath,
      tags: { ...this.config.tags, type: name },
    });
  }
}

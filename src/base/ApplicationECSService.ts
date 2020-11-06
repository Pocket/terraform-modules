import {
  AlbListenerRule,
  CloudwatchLogGroup,
  EcrRepository,
  EcsService,
  EcsServiceLoadBalancer,
  EcsServiceNetworkConfiguration,
  EcsTaskDefinition,
  SecurityGroup,
  SecurityGroupEgress,
  SecurityGroupIngress,
} from '../../.gen/providers/aws';
import { Resource } from '../../.gen/providers/null';
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

export interface ApplicationECSServiceProps {
  prefix: string;
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
  codeDeploySnsNotificationTopicArn?: string;
}

interface ECSTaskDefinitionResponse {
  taskDef: EcsTaskDefinition;
  ecrRepos: EcrRepository[];
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationECSService extends Resource {
  public readonly service: EcsService;
  public readonly ecsSecurityGroup: SecurityGroup;

  private readonly config: ApplicationECSServiceProps;
  public readonly mainTargetGroup?: ApplicationTargetGroup;

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

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSServiceProps
  ) {
    super(scope, name);

    // populate defaults for some values if not provided
    this.config = ApplicationECSService.hydrateConfig(config);

    this.ecsSecurityGroup = this.setupECSSecurityGroups();
    const { taskDef, ecrRepos } = this.setupECSTaskDefinition();

    //Setup an array of resources that the ecs service will need to depend on
    const ecsServiceDependsOn: TerraformResource[] = [...ecrRepos];

    const ecsNetworkConfig: EcsServiceNetworkConfiguration = {
      securityGroups: [this.ecsSecurityGroup.id],
      subnets: config.privateSubnetIds,
    };

    const ecsLoadBalancerConfig: EcsServiceLoadBalancer[] = [];

    const targetGroupNames: string[] = [];

    // If we have a alb configuration lets add it.
    if (config.albConfig) {
      this.mainTargetGroup = this.createTargetGroup('blue');
      ecsServiceDependsOn.push(this.mainTargetGroup.targetGroup);
      // Now that we have our service created, we append the alb listener rule to our HTTPS listener.
      const listenerRule = new AlbListenerRule(this, 'listener_rule', {
        listenerArn: this.config.albConfig.listenerArn,
        priority: 1,
        condition: [
          {
            pathPattern: [{ values: ['*'] }],
          },
        ],
        action: [
          {
            type: 'forward',
            targetGroupArn: this.mainTargetGroup.targetGroup.arn,
          },
        ],
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
    this.service = new EcsService(this, 'ecs-service', {
      name: `${this.config.prefix}`,
      taskDefinition: taskDef.arn,
      deploymentController: this.config.useCodeDeploy
        ? [{ type: 'CODE_DEPLOY' }]
        : [{ type: 'ECS' }],
      launchType: this.config.launchType,
      deploymentMinimumHealthyPercent: this.config
        .deploymentMinimumHealthyPercent,
      deploymentMaximumPercent: this.config.deploymentMaximumPercent,
      desiredCount: this.config.desiredCount,
      cluster: this.config.ecsClusterArn,
      loadBalancer: ecsLoadBalancerConfig,
      networkConfiguration: [ecsNetworkConfig],
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
      const codeDeployApp = new ApplicationECSAlbCodeDeploy(
        this,
        'ecs_codedeploy',
        {
          prefix: this.config.prefix,
          serviceName: this.service.name,
          clusterName: this.config.ecsClusterName,
          targetGroupNames: targetGroupNames,
          listenerArn: this.config.albConfig.listenerArn,
          snsNotificationTopicArn: this.config
            .codeDeploySnsNotificationTopicArn,
          tags: this.config.tags,
          dependsOn: [this.service],
        }
      );

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
        `export app_spec_content_string='{"version":1,"Resources":[{"TargetService":{"Type":"AWS::ECS::Service","Properties":{"TaskDefinition":"${taskDef.arn}","LoadBalancerInfo":{"ContainerName":"${this.config.albConfig.containerName}","ContainerPort":${this.config.albConfig.containerPort}}}}}]}' && export revision="revisionType=AppSpecContent,appSpecContent={content='$app_spec_content_string'}" && aws deploy create-deployment  --application-name="${codeDeployApp.codeDeployApp.name}"  --deployment-group-name="${codeDeployApp.codeDeployDeploymentGroup.deploymentGroupName}" --description="Triggered from Terraform/CodeBuild due to a task definition update" --revision="$revision"`
      );
    }

    // NEXT STEPS:

    // https://getpocket.atlassian.net/browse/BACK-411
    // build in autoscaling
  }

  /**
   * Sets up the required ECS Security Groups
   * @private
   */
  private setupECSSecurityGroups(): SecurityGroup {
    let ingress: SecurityGroupIngress[] = [];
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

    const egress: SecurityGroupEgress[] = [
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

    return new SecurityGroup(this, `ecs_security_group`, {
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
    const ecrRepos: EcrRepository[] = [];

    const containerDefs = [];

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
        const cloudwatch = new CloudwatchLogGroup(this, `ecs-${def.name}`, {
          namePrefix: `/ecs/${this.config.prefix}/${def.name}`,
          retentionInDays: 30,
          tags: this.config.tags,
        });
        def.logGroup = cloudwatch.name;
      }

      containerDefs.push(buildDefinitionJSON(def));
    });

    const ecsIam = new ApplicationECSIAM(this, 'ecs-iam', {
      prefix: this.config.prefix,
      tags: this.config.tags,
      taskExecutionDefaultAttachmentArn: this.config.ecsIamConfig
        .taskExecutionDefaultAttachmentArn,
      taskExecutionRolePolicyStatements: this.config.ecsIamConfig
        .taskExecutionRolePolicyStatements,
      taskRolePolicyStatements: this.config.ecsIamConfig
        .taskRolePolicyStatements,
    });

    //Create task definition
    const taskDef = new EcsTaskDefinition(this, 'ecs-task', {
      // why are container definitions just JSON? can we get a real construct? sheesh.
      containerDefinitions: `[${containerDefs}]`,
      family: `${this.config.prefix}`,
      executionRoleArn: ecsIam.taskExecutionRoleArn,
      taskRoleArn: ecsIam.taskRoleArn,
      cpu: this.config.cpu.toString(),
      memory: this.config.memory.toString(),
      requiresCompatibilities: ['FARGATE'],
      networkMode: 'awsvpc',
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
      shortName: this.config.shortName,
      vpcId: this.config.vpcId,
      healthCheckPath: this.config.albConfig.healthCheckPath,
      tags: this.config.tags,
    });
  }
}

import { Resource } from 'cdktf';
import {
  EcsService,
  SecurityGroup,
  SecurityGroupEgress,
  SecurityGroupIngress,
  EcsTaskDefinition,
  EcsServiceNetworkConfiguration,
  DataAwsIamPolicyDocumentStatement,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';
import { ApplicationECR, ECRProps } from './ApplicationECR';
import { ApplicationECSIAM, ApplicationECSIAMProps } from './ApplicationECSIAM';
import {
  ApplicationECSContainerDefinitionProps,
  buildDefinitionJSON,
} from './ApplicationECSContainerDefinition';

export interface ApplicationECSServiceProps {
  prefix: string;
  name: string;
  tags?: { [key: string]: string };
  ecsCluster: string;
  vpcId: string;
  albSecurityGroupConfig?: {
    containerPort: number;
    albSecurityGroupId: string;
  };
  containerConfigs: ApplicationECSContainerDefinitionProps[];
  privateSubnetIds: string[];
  launchType?: string; // defaults to 'FARGATE'
  deploymentMinimumHealthyPercent?: number; // defaults to 100
  deploymentMaximumPercent?: number; // defaults to 200
  desiredCount?: number; // defaults to 2
  lifecycleIgnoreChanges?: string[]; // defaults to ['task_definition', 'desired_count', 'load_balancer']
  ecsIamConfig: ApplicationECSIAMProps;
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationECSService extends Resource {
  public readonly service: EcsService;
  public readonly ecsSecurityGroup: SecurityGroup;

  // set defaults on optional properties
  private static hydrateConfig(
    config: ApplicationECSServiceProps
  ): ApplicationECSServiceProps {
    config.launchType = config.launchType || 'FARGATE';
    config.deploymentMinimumHealthyPercent =
      config.deploymentMinimumHealthyPercent || 100;
    config.deploymentMaximumPercent = config.deploymentMaximumPercent || 200;
    config.desiredCount = config.desiredCount || 2;
    config.lifecycleIgnoreChanges = config.lifecycleIgnoreChanges || [
      'task_definition',
      'desired_count',
      'load_balancer',
    ];

    return config;
  }

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSServiceProps
  ) {
    super(scope, name);

    // populate defaults for some values if not provided
    config = ApplicationECSService.hydrateConfig(config);

    let ingress: SecurityGroupIngress[] = [];
    if (config.albSecurityGroupConfig) {
      ingress = [
        {
          fromPort: 80,
          protocol: 'TCP',
          toPort: config.albSecurityGroupConfig.containerPort,
          securityGroups: [config.albSecurityGroupConfig.albSecurityGroupId],
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

    this.ecsSecurityGroup = new SecurityGroup(this, `ecs_security_group`, {
      name: `${config.prefix}-${config.name}-ECSSecurityGroup`,
      description: 'Internal ECS Security Group',
      vpcId: config.vpcId,
      ingress,
      egress,
    });

    const containerDefs = [];

    // figure out if we need to create an ECR for each container definition
    // also build a container definition JSON for each container
    config.containerConfigs.forEach((def) => {
      // if an image has been given, it must already live somewhere, so an ECR isn't needed
      if (!def.containerImage) {
        const ecrConfig: ECRProps = {
          name: `${config.prefix}-${config.name}-${def.name}`.toLowerCase(),
          tags: config.tags,
        };

        new ApplicationECR(this, `ecr-${def.name}`, ecrConfig);
      }

      containerDefs.push(buildDefinitionJSON(def));
    });

    const ecsIam = new ApplicationECSIAM(this, 'ecs-iam', {
      name: config.name,
      prefix: config.prefix,
      tags: config.tags,
      taskExecutionDefaultAttachmentArn:
        config.ecsIamConfig.taskExecutionDefaultAttachmentArn,
      taskExecutionRolePolicyStatements:
        config.ecsIamConfig.taskExecutionRolePolicyStatements,
      taskRolePolicyStatements: config.ecsIamConfig.taskRolePolicyStatements,
    });

    //Create task definition
    const taskDef = new EcsTaskDefinition(this, 'ecs-task', {
      // why are container definitions just JSON? can we get a real construct? sheesh.
      containerDefinitions: `[${containerDefs}]`,
      family: `${config.prefix}-${config.name}`,
      executionRoleArn: ecsIam.taskExecutionRoleArn,
      taskRoleArn: ecsIam.taskRoleArn,
    });

    const ecsNetworkConfig: EcsServiceNetworkConfiguration = {
      securityGroups: [this.ecsSecurityGroup.id],
      subnets: config.privateSubnetIds,
    };

    //create ecs service
    new EcsService(this, 'ecs-service', {
      name: `${config.prefix}-${config.name}`,
      taskDefinition: taskDef.arn,
      //deploymentController: ['CODE_DEPLOY'], // TODO: enable when code deploy is baked into these modules
      launchType: config.launchType,
      deploymentMinimumHealthyPercent: config.deploymentMinimumHealthyPercent,
      deploymentMaximumPercent: config.deploymentMaximumPercent,
      desiredCount: config.desiredCount,
      //cluster: cluster.arn, // where's this going to come from? pass in from elsewhere
      //loadBalancer: loadBalancer, // where's this coming from? pass in from elsewhere
      networkConfiguration: [ecsNetworkConfig],
      propagateTags: 'SERVICE',
      lifecycle: {
        ignoreChanges: config.lifecycleIgnoreChanges,
        createBeforeDestroy: true, // TODO: should this be in config?
      },
    });

    // NEXT STEPS:

    // https://getpocket.atlassian.net/browse/BACK-410
    // create alb target groups (one for each deployment - blue/green)
    // check user-list-search: https://github.com/Pocket/user-list-search/blob/main/.aws/alb.tf#L65-L111

    // https://getpocket.atlassian.net/browse/BACK-411
    // build in autoscaling

    // https://getpocket.atlassian.net/browse/BACK-412
    // build in Code Deploy
    // create two target groups - blue/green
    // check user-list-search: https://github.com/Pocket/user-list-search/blob/main/.aws/apollo_codedeploy.tf
  }
}

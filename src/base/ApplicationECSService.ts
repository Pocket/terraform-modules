import { Resource } from 'cdktf';
import {
  EcsService,
  SecurityGroup,
  SecurityGroupEgress,
  SecurityGroupIngress,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';
import { ApplicationECR, ECRProps } from './ApplicationECR';

export interface ApplicationContainerDefinitionProps {
  containerName: string;
  envVars?: { [key: string]: string };
  secretEnvVars?: { [key: string]: string };
  containerImage?: string;
}

export interface ApplicationECSConfigProps {
  port: number;
  containerName: string;
  containerDefinitions: ApplicationContainerDefinitionProps[];
}

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
  taskDefinition: ApplicationECSConfigProps;
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationECSService extends Resource {
  public readonly service: EcsService;
  public readonly ecsSecurityGroup: SecurityGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSServiceProps
  ) {
    super(scope, name);

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
      },
    ];

    this.ecsSecurityGroup = new SecurityGroup(this, `ecs_security_group`, {
      name: `${config.prefix}-${config.name}-ECSSecurityGroup`,
      description: 'Internal ECS Security Group',
      vpcId: config.vpcId,
      ingress,
      egress,
    });

    // figure out if we need to create an ECR for each container definition
    config.taskDefinition.containerDefinitions.forEach((def) => {
      // if an image has been given, it must already live somewhere, so an ECR isn't needed
      if (!def.containerImage) {
        const ecrConfig: ECRProps = {
          name: `${config.prefix}-${config.name}-${def.containerName}`.toLowerCase(),
          tags: config.tags,
        };

        new ApplicationECR(this, `ecr-${def.containerName}`, ecrConfig);
      }
    });

    //ENV variables??

    //Create container defintions

    //Create task definition

    //create ecs service

    //create alb target groups

    //CodeDeploy?????

    //put autoscaling in another file?
  }
}

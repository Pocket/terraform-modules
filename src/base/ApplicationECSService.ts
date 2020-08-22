import { Resource } from 'cdktf';
import {
  EcsService,
  SecurityGroup,
  SecurityGroupEgress,
  SecurityGroupIngress,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

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

    this.ecsSecurityGroup = new SecurityGroup(
      scope,
      `${name}_ecs_security_group`,
      {
        name: `${config.prefix}-${config.name}-ECSSecurityGroup`,
        description: 'Internal ECS Security Group',
        vpcId: config.vpcId,
        ingress,
        egress,
      }
    );

    //ENV variables??

    //Create container defintions

    //Create task definition

    //create ecs service

    //create alb target groups

    //CodeDeploy?????

    //put autoscaling in another file?
  }
}

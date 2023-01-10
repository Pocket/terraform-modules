import { elb } from '@cdktf/provider-aws';
import { Resource, TerraformMetaArguments } from 'cdktf';
import { Construct } from 'constructs';

export interface ApplicationTargetGroupProps extends TerraformMetaArguments {
  shortName: string;
  vpcId: string;
  healthCheckPath: string;
  tags?: { [key: string]: string };
}

export class ApplicationTargetGroup extends Resource {
  public readonly targetGroup: elb.AlbTargetGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationTargetGroupProps
  ) {
    super(scope, name);

    this.targetGroup = new elb.AlbTargetGroup(this, 'ecs_target_group', {
      namePrefix: config.shortName,
      protocol: 'HTTP',
      vpcId: config.vpcId,
      tags: config.tags,
      targetType: 'ip',
      port: 80,
      deregistrationDelay: '120',
      healthCheck: {
        interval: 15,
        path: config.healthCheckPath,
        protocol: 'HTTP',
        healthyThreshold: 5,
        unhealthyThreshold: 3,
      },
      provider: config.provider,
    });
  }
}

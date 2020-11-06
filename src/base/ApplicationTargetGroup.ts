import { AlbTargetGroup } from '../../.gen/providers/aws';
import { Resource } from 'cdktf';
import { Construct } from 'constructs';

export interface ApplicationTargetGroupProps {
  shortName: string;
  vpcId: string;
  healthCheckPath: string;
  tags?: { [key: string]: string };
}

export class ApplicationTargetGroup extends Resource {
  public readonly targetGroup: AlbTargetGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationTargetGroupProps
  ) {
    super(scope, name);

    this.targetGroup = new AlbTargetGroup(this, 'ecs_target_group', {
      namePrefix: config.shortName,
      protocol: 'HTTP',
      vpcId: config.vpcId,
      tags: config.tags,
      targetType: 'ip',
      port: 80,
      deregistrationDelay: 120,
      healthCheck: [
        {
          interval: 15,
          path: config.healthCheckPath,
          protocol: 'HTTP',
          healthyThreshold: 5,
          unhealthyThreshold: 3,
        },
      ],
    });
  }
}

import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { AlbTargetGroup } from '../../.gen/providers/aws';

export interface ApplicationLoadBalancerTargetGroupProps {
  interval: number;
  path: string;
  protocol: string;
  protocolHealthCheck: string;
  healthyThreshold: number;
  unhealthyThreshold: number;
  timeout: number;
  tags?: { [key: string]: string };
  vpcId: string;
  port: number;
  name: string;
  targetType: string;
  deregistrationDelay: number;
  dependsOn?: Resource[];
}

/**
 * Generates an ALB Target Group
 */
export class ApplicationLoadBalancerTargetGroup extends Resource {
  public readonly albTargetGroup: AlbTargetGroup;
  constructor(
    scope: Construct,
    name: string,
    config: ApplicationLoadBalancerTargetGroupProps
  ) {
    super(scope, name);

    const albTargetGroupConfig = {
      healthCheck: [
        {
          interval: config.interval,
          path: config.path,
          protocol: config.protocol,
          healthyThreshold: config.healthyThreshold,
          unhealthyThreshold: config.unhealthyThreshold,
          timeout: config.timeout,
        },
      ],
      vpcId: config.vpcId,
      protocol: config.protocolHealthCheck,
      port: config.port,
      name: config.name,
      targetType: config.targetType,
      deregistrationDelay: config.deregistrationDelay,
      tags: config.tags,
    };
    if (config.dependsOn) {
      albTargetGroupConfig[`dependsOn`] = config.dependsOn;
    }
    this.albTargetGroup = new AlbTargetGroup(
      this,
      `alb_target_group`,
      albTargetGroupConfig
    );
  }
}

import { Resource } from 'cdktf';
import { EcsCluster } from '../../.gen/providers/aws';
import { Construct } from 'constructs';

export interface ApplicationECSClusterProps {
  prefix: string;
  tags?: { [key: string]: string };
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationECSCluster extends Resource {
  public readonly cluster: EcsCluster;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSClusterProps
  ) {
    super(scope, name);

    this.cluster = new EcsCluster(scope, `${name}_ecs_cluster`, {
      tags: config.tags,
      name: config.prefix,
      setting: [
        {
          name: 'ContainerInsights',
          value: 'ENABLED',
        },
      ],
    });
  }
}

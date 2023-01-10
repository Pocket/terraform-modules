import { Resource, TerraformMetaArguments } from 'cdktf';
import { ecs } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

export interface ApplicationECSClusterProps extends TerraformMetaArguments {
  prefix: string;
  tags?: { [key: string]: string };
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationECSCluster extends Resource {
  public readonly cluster: ecs.EcsCluster;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSClusterProps
  ) {
    super(scope, name);

    this.cluster = new ecs.EcsCluster(this, `ecs_cluster`, {
      tags: config.tags,
      name: config.prefix,
      setting: [
        {
          name: 'containerInsights',
          value: 'enabled',
        },
      ],
      provider: config.provider,
    });
  }
}

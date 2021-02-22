import { Resource } from 'cdktf';
import {
  DataAwsVpc,
  ElasticacheCluster,
  ElasticacheSubnetGroup,
  SecurityGroup,
  ElasticacheClusterConfig,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

export enum ApplicationElasticacheEngine {
  MEMCACHED = 'memcached',
  REDIS = 'redis',
}

/**
 * Creates a types that allows us to write to readonly amazon types when we are conditionaly building configs
 */
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export interface ApplicationElasticacheClusterProps {
  prefix: string;
  vpcId: string;
  subnetIds: string[];
  allowedIngressSecurityGroupIds: string[];
  engine: ApplicationElasticacheEngine;
  node?: {
    /**
     * This is the size as defined here:https://aws.amazon.com/elasticache/pricing
     * Theres a lot here to make an enum for this..
     */
    size?: string;
    /**
     * Number of nodes that should exist in the cluster
     */
    count?: number;
  };
  tags?: { [key: string]: string };
}

const DEFAULT_CONFIG = {
  node: {
    size: 'cache.t2.micro',
    count: 2,
  },
};

/**
 * Generates an elasticache cluster with the desired engine
 */
export class ApplicationElasticacheCluster extends Resource {
  public elasticacheCluster: ElasticacheCluster;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationElasticacheClusterProps
  ) {
    super(scope, name);

    // use default config, but update any user-provided values
    config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    const vpc = new DataAwsVpc(this, `vpc`, {
      filter: [
        {
          name: 'vpc-id',
          values: [config.vpcId],
        },
      ],
    });

    this.elasticacheCluster = ApplicationElasticacheCluster.createElasticacheCluster(
      this,
      vpc,
      config
    );
  }

  /**
   * Returns the default port for the selected engine
   * @param engine
   * @private
   */
  private static getPortForEngine(
    engine: ApplicationElasticacheEngine
  ): number {
    switch (engine) {
      case ApplicationElasticacheEngine.MEMCACHED:
        return 11211;
      case ApplicationElasticacheEngine.REDIS:
        return 6379;
    }
  }

  /**
   * Returns the default parameter group for the selected engine
   * @param engine
   * @private
   */
  private static getParameterGroupForEngine(
    engine: ApplicationElasticacheEngine
  ): string {
    switch (engine) {
      case ApplicationElasticacheEngine.MEMCACHED:
        return 'default.memcached1.6';
      case ApplicationElasticacheEngine.REDIS:
        return 'default.redis6.x';
    }
  }

  /**
   * Returns the default engine version for the selected engine
   * @param engine
   * @private
   */
  private static getEngineVersionForEngine(
    engine: ApplicationElasticacheEngine
  ): string {
    switch (engine) {
      case ApplicationElasticacheEngine.MEMCACHED:
        return '1.6.6';
      case ApplicationElasticacheEngine.REDIS:
        return '6.x';
    }
  }

  /**
   * Creates the elasticache cluster to be used
   * @param scope
   * @param vpc
   * @param config
   * @private
   */
  private static createElasticacheCluster(
    scope: Construct,
    vpc: DataAwsVpc,
    config: ApplicationElasticacheClusterProps
  ) {
    const securityGroup = new SecurityGroup(
      scope,
      'elasticache_security_group',
      {
        namePrefix: config.prefix,
        description: 'Managed by Terraform',
        vpcId: vpc.id,
        ingress: [
          {
            fromPort: ApplicationElasticacheCluster.getPortForEngine(
              config.engine
            ),
            toPort: ApplicationElasticacheCluster.getPortForEngine(
              config.engine
            ),
            protocol: 'tcp',

            //If we have a ingress security group it takes precedence
            securityGroups: config.allowedIngressSecurityGroupIds
              ? config.allowedIngressSecurityGroupIds
              : null,

            //IF we do not have a ingress security group lets all the whole vpc access
            cidrBlocks: config.allowedIngressSecurityGroupIds
              ? null
              : [vpc.cidrBlock],

            // the following are included due to a bug
            // https://github.com/hashicorp/terraform-cdk/issues/223
            description: null,
            ipv6CidrBlocks: null,
            prefixListIds: null,
          },
        ],
        tags: config.tags,
      }
    );
    // @ts-ignore: https://github.com/hashicorp/terraform-cdk/issues/282
    securityGroup.addOverride('ingress.0.self', null);

    const subnetGroup = new ElasticacheSubnetGroup(
      scope,
      'elasticache_subnet_group',
      {
        name: `${config.prefix.toLowerCase()}-ElasticacheSubnetGroup`,
        subnetIds: config.subnetIds,
      }
    );

    return new ElasticacheCluster(scope, `elasticache_cluster`, {
      clusterId: config.prefix.toLowerCase(),
      engine: config.engine.toString(),
      nodeType: config.node.size,
      numCacheNodes: config.node.count,
      parameterGroupName: ApplicationElasticacheCluster.getParameterGroupForEngine(
        config.engine
      ),
      port: ApplicationElasticacheCluster.getPortForEngine(config.engine),
      engineVersion: ApplicationElasticacheCluster.getEngineVersionForEngine(
        config.engine
      ),
      subnetGroupName: subnetGroup.name,
      securityGroupIds: [securityGroup.id],
      tags: config.tags,
      applyImmediately: true,
      dependsOn: [subnetGroup, securityGroup],
    });
  }
}

import {
  ApplicationElasticacheCluster,
  ApplicationElasticacheClusterProps,
  ApplicationElasticacheEngine,
} from './ApplicationElasticacheCluster';
import { Construct } from 'constructs';
import { vpc, elasticache } from '@cdktf/provider-aws';

const DEFAULT_CONFIG = {
  node: {
    size: 'cache.t3.micro',
    count: 2,
  },
};

export class ApplicationRedis extends ApplicationElasticacheCluster {
  public elasticacheReplicationGroup: elasticache.ElasticacheReplicationGroup;

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

    const appVpc = ApplicationElasticacheCluster.getVpc(this, config);

    this.elasticacheReplicationGroup =
      ApplicationRedis.createElasticacheReplicationCluster(
        this,
        appVpc,
        config
      );
  }

  /**
   * Creates the elasticache cluster to be used
   * @param scope
   * @param appVpc
   * @param config
   * @private
   */
  private static createElasticacheReplicationCluster(
    scope: Construct,
    appVpc: vpc.DataAwsVpc,
    config: ApplicationElasticacheClusterProps
  ): elasticache.ElasticacheReplicationGroup {
    const engine = ApplicationElasticacheEngine.REDIS;
    const port = ApplicationElasticacheCluster.getPortForEngine(engine);

    const { securityGroup, subnetGroup } =
      ApplicationRedis.createSecurityGroupAndSubnet(
        scope,
        config,
        appVpc,
        port
      );

    return new elasticache.ElasticacheReplicationGroup(
      scope,
      'elasticache_replication_group',
      {
        replicationGroupId: `${config.prefix.toLowerCase()}`,
        replicationGroupDescription: `${config.prefix.toLowerCase()} | Managed by terraform`,
        nodeType: config.node.size,
        port: port,
        parameterGroupName: ApplicationRedis.getParameterGroupForEngine(engine),
        automaticFailoverEnabled: true,
        subnetGroupName: subnetGroup.name,
        securityGroupIds: [securityGroup.id],
        tags: config.tags,
        applyImmediately: true,
        dependsOn: [subnetGroup, securityGroup],
        numberCacheClusters: config.node.count ?? 2,
        multiAzEnabled: true,
        provider: config.provider,
      }
    );
  }
}

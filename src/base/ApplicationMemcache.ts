import {
  ApplicationElasticacheCluster,
  ApplicationElasticacheClusterProps,
  ApplicationElasticacheEngine,
} from './ApplicationElasticacheCluster';
import { Construct } from 'constructs';
import { vpc, elasticache } from '@cdktf/provider-aws';

const DEFAULT_CONFIG = {
  node: {
    size: 'cache.t2.micro',
    count: 2,
  },
};

export class ApplicationMemcache extends ApplicationElasticacheCluster {
  public elasticacheCluster: elasticache.ElasticacheCluster;

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

    this.elasticacheCluster = ApplicationMemcache.createElasticacheCluster(
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
  private static createElasticacheCluster(
    scope: Construct,
    appVpc: vpc.DataAwsVpc,
    config: ApplicationElasticacheClusterProps
  ): elasticache.ElasticacheCluster {
    const engine = ApplicationElasticacheEngine.MEMCACHED;
    const port = ApplicationElasticacheCluster.getPortForEngine(engine);

    const { securityGroup, subnetGroup } = this.createSecurityGroupAndSubnet(
      scope,
      config,
      appVpc,
      port
    );

    return new elasticache.ElasticacheCluster(scope, `elasticache_cluster`, {
      clusterId: config.prefix.toLowerCase(),
      engine: engine.toString(),
      nodeType: config.node.size,
      numCacheNodes: config.node.count,
      parameterGroupName:
        ApplicationMemcache.getParameterGroupForEngine(engine),
      port: port,
      engineVersion:
        ApplicationElasticacheCluster.getEngineVersionForEngine(engine),
      subnetGroupName: subnetGroup.name,
      securityGroupIds: [securityGroup.id],
      tags: config.tags,
      applyImmediately: true,
      dependsOn: [subnetGroup, securityGroup],
      provider: config.provider,
    });
  }
}

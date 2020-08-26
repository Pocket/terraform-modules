import { Resource } from 'cdktf';
import {
  DataAwsVpc,
  DbSubnetGroup,
  RdsCluster,
  RdsClusterConfig,
  SecurityGroup,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

export interface ApplicationRDSClusterProps {
  prefix: string;
  vpcId: string;
  subnetIds: string[];
  rdsConfig: ApplicationRDSClusterConfig;
  tags?: { [key: string]: string };
}

//Override the default rds config but remove the items that we set ourselves.
export interface ApplicationRDSClusterConfig extends RdsClusterConfig {
  clusterIdentifierPrefix: never;
  vpcSecurityGroupIds: never;
  dbSubnetGroupName: never;
  masterUsername: never;
  masterPassword: never;
  copyTagsToSnapshot: never;
  tags: never;
  lifecycle: never;
}

/**
 * Generates a rds instance
 */
export class ApplicationRDSCluster extends Resource {
  public readonly rds: RdsCluster;
  constructor(
    scope: Construct,
    name: string,
    config: ApplicationRDSClusterProps
  ) {
    super(scope, name);

    const vpc = new DataAwsVpc(scope, `${name}_vpc`, {
      filter: [
        {
          name: 'vpc-id',
          values: [config.vpcId],
        },
      ],
    });

    const securityGroup = new SecurityGroup(scope, name, {
      namePrefix: config.prefix,
      description: 'Managed by Terraform',
      vpcId: vpc.id,
      ingress: [
        {
          fromPort: 3306,
          toPort: 3306,
          protocol: 'tcp',
          cidrBlocks: [vpc.cidrBlock],
        },
      ],
    });

    const subnetGroup = new DbSubnetGroup(scope, name, {
      namePrefix: config.prefix.toLowerCase(),
      subnetIds: config.subnetIds,
    });

    this.rds = new RdsCluster(scope, name, {
      ...config.rdsConfig,
      clusterIdentifierPrefix: config.prefix.toLowerCase(),
      tags: config.tags,
      copyTagsToSnapshot: true, //Why would we ever want this to false??
      masterUsername: 'blah', //TODO: Random generation
      masterPassword: 'blah!',
      vpcSecurityGroupIds: [securityGroup.id],
      dbSubnetGroupName: subnetGroup.name,
    });
  }
}

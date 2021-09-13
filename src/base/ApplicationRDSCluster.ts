import { Resource } from 'cdktf';
import {
  DataAwsVpc,
  DbSubnetGroup,
  RdsCluster,
  RdsClusterConfig,
  SecretsmanagerSecret,
  SecretsmanagerSecretVersion,
  SecurityGroup,
} from '@cdktf/provider-aws';
import { Construct } from 'constructs';
import crypto from 'crypto';

//Override the default rds config but remove the items that we set ourselves.
export type ApplicationRDSClusterConfig = Omit<
  RdsClusterConfig,
  | 'clusterIdentifierPrefix'
  | 'vpcSecurityGroupIds'
  | 'dbSubnetGroupName'
  | 'copyTagsToSnapshot'
  | 'tags'
  | 'lifecycle'
> & {
  // masterUsername is not a required field in the RdsClusterConfig type but is required for create an RDS cluster
  masterUsername: string;
  masterPassword?: string;
  engine?: 'aurora' | 'aurora-mysql' | 'aurora-postgresql';
};

export interface ApplicationRDSClusterProps {
  prefix: string;
  vpcId: string;
  subnetIds: string[];
  rdsConfig: ApplicationRDSClusterConfig;
  tags?: { [key: string]: string };
}

/**
 * Generates an RDS cluster
 *
 * The database will be initialized with a random password.
 *
 * If the database is Aurora or MySQL, a SecretsManager secret will be created with a rotation lambda
 * that you can invoke in the AWS console after creation to rotate the password
 */
export class ApplicationRDSCluster extends Resource {
  public readonly rds: RdsCluster;
  public readonly secretARN?: string;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationRDSClusterProps
  ) {
    super(scope, name);

    const vpc = new DataAwsVpc(this, `vpc`, {
      filter: [
        {
          name: 'vpc-id',
          values: [config.vpcId],
        },
      ],
    });

    // Set the default port for mysql/postgresql based on the engine value for RDS
    const rdsPort = config.rdsConfig.engine?.includes('postgresql')
      ? 5432
      : 3306;

    const securityGroup = new SecurityGroup(this, 'rds_security_group', {
      namePrefix: config.prefix,
      description: 'Managed by Terraform',
      vpcId: vpc.id,
      ingress: [
        {
          fromPort: rdsPort,
          toPort: rdsPort,
          protocol: 'tcp',
          cidrBlocks: [vpc.cidrBlock],
          // the following are included due to a bug
          // https://github.com/hashicorp/terraform-cdk/issues/223
          description: null,
          ipv6CidrBlocks: null,
          prefixListIds: null,
          securityGroups: null,
        },
      ],
      egress: [
        {
          fromPort: 0,
          protocol: '-1',
          toPort: 0,
          cidrBlocks: ['0.0.0.0/0'],
          description: 'required',
          ipv6CidrBlocks: [],
          prefixListIds: [],
          securityGroups: [],
        },
      ],
    });

    const subnetGroup = new DbSubnetGroup(this, 'rds_subnet_group', {
      namePrefix: config.prefix.toLowerCase(),
      subnetIds: config.subnetIds,
    });

    this.rds = new RdsCluster(this, 'rds_cluster', {
      ...config.rdsConfig,
      clusterIdentifierPrefix: config.prefix.toLowerCase(),
      tags: config.tags,
      copyTagsToSnapshot: true, //Why would we ever want this to false??
      masterPassword:
        config.rdsConfig.masterPassword ??
        crypto.randomBytes(8).toString('hex'),
      vpcSecurityGroupIds: [securityGroup.id],
      dbSubnetGroupName: subnetGroup.name,
      lifecycle: {
        ignoreChanges: ['master_username', 'master_password'],
      },
    });

    // Create secrets manager resource for the RDS
    // This value should be changed after initial creation
    const { secretARN } = ApplicationRDSCluster.createRdsSecret(
      this,
      this.rds,
      rdsPort,
      config.prefix,
      config.tags,
      config.rdsConfig.engine
    );

    this.secretARN = secretARN;
  }

  /**
   * Create an RDS secret
   *
   * @param scope
   * @param rds
   * @param rdsPort
   * @param prefix
   * @param tags
   * @private
   */
  private static createRdsSecret(
    scope: Construct,
    rds: RdsCluster,
    rdsPort: number,
    prefix: string,
    tags?: { [key: string]: string },
    engine?: ApplicationRDSClusterConfig['engine']
  ): { secretARN: string } {
    //Create the secret
    const secret = new SecretsmanagerSecret(scope, `rds_secret`, {
      description: `Secret For ${rds.clusterIdentifier}`,
      name: `${prefix}/${rds.clusterIdentifier}`,
      //We dont auto rotate, because our apps dont have triggers to refresh yet.
      //This is mainly so we can rotate after we create the RDS.
      dependsOn: [rds],
    });

    const secretValues: {
      engine: string;
      host: string;
      username: string;
      password: string;
      dbname: string;
      port: number;
      database_url?: string;
    } = {
      engine: rds.engine,
      host: rds.endpoint,
      username: rds.masterUsername,
      password: rds.masterPassword,
      dbname: rds.databaseName,
      port: rdsPort,
    };

    // Add a database URL to a MySQL-compatible Aurora instance
    if (engine && engine === 'aurora-mysql') {
      secretValues.database_url = `mysql://${rds.masterUsername}:${rds.masterPassword}@${rds.endpoint}:${rdsPort}/${rds.databaseName}`;
    }

    //Create the initial secret version
    new SecretsmanagerSecretVersion(scope, `rds_secret_version`, {
      secretId: secret.id,
      secretString: JSON.stringify(secretValues),
      dependsOn: [secret],
    });

    return { secretARN: secret.arn };
  }
}

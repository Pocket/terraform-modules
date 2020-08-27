import { Resource } from 'cdktf';
import {
  DataAwsIamPolicyDocument,
  DataAwsVpc,
  DbSubnetGroup,
  IamPolicy,
  IamRole,
  IamRolePolicyAttachment,
  LambdaFunction,
  LambdaPermission,
  RdsCluster,
  RdsClusterConfig,
  SecretsmanagerSecret,
  SecretsmanagerSecretVersion,
  SecurityGroup,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';
import { DataArchiveFile } from '../../.gen/providers/archive';
import * as fs from 'fs';
import cryptoRandomString from 'crypto-random-string';

export interface ApplicationRDSClusterProps {
  prefix: string;
  vpcId: string;
  subnetIds: string[];
  rdsConfig: ApplicationRDSClusterConfig;
  tags?: { [key: string]: string };
}

//Override the default rds config but remove the items that we set ourselves.
export type ApplicationRDSClusterConfig = Omit<
  RdsClusterConfig,
  | 'clusterIdentifierPrefix'
  | 'vpcSecurityGroupIds'
  | 'dbSubnetGroupName'
  | 'masterPassword'
  | 'copyTagsToSnapshot'
  | 'tags'
  | 'lifecycle'
>;

/**
 * Generates a rds cluster
 *
 * The database will be intialized with a random password.
 *
 * If the database is aurua or mysql, a SecretsManager secret will be created with a rotation lambda
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

    const securityGroup = new SecurityGroup(this, 'rds_security_group', {
      namePrefix: config.prefix,
      description: 'Managed by Terraform',
      vpcId: vpc.id,
      ingress: [
        {
          fromPort: 3306,
          toPort: 3306,
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
      masterPassword: cryptoRandomString({ length: 15 }),
      vpcSecurityGroupIds: [securityGroup.id],
      dbSubnetGroupName: subnetGroup.name,
      lifecycle: {
        ignoreChanges: ['master_username', 'master_password'],
      },
    });

    if (
      config.rdsConfig.engine == 'aurora' ||
      config.rdsConfig.engine == 'mysql'
    ) {
      //If the engine is mysql or aurora (mysql compatible) then create a secret rotator that we can manually run after terraform creation
      const { secretARN } = ApplicationRDSCluster.createMySqlSecretRotator(
        this,
        this.rds,
        [securityGroup.id],
        config.subnetIds,
        config.prefix,
        config.tags
      );
      this.secretARN = secretARN;
    }
  }

  /**
   * Create a lambda that will rotate the master password of the database on demand
   *
   * @param scope
   * @param rds
   * @param securityGroupIds
   * @param subnetIds
   * @param prefix
   * @param tags
   * @private
   */
  private static createMySqlSecretRotator(
    scope: Construct,
    rds: RdsCluster,
    securityGroupIds: string[],
    subnetIds: string[],
    prefix: string,
    tags?: { [key: string]: string }
  ): { secretARN: string } {
    //The example from AWS was in python, so we import it into archive
    const lambdaFile = fs.readFileSync(
      './lambda_functions/single_mysql_rotation.py',
      'utf8'
    );
    const lambdaArchive = new DataArchiveFile(scope, `rotation_lambda_zip`, {
      type: 'zip',
      outputPath: '/tmp/lambda_zip_inline.zip',
      source: [
        {
          content: lambdaFile,
          filename: 'index.py',
        },
      ],
    });

    //Create the role for the rotation lambda
    const lambdaRole = new IamRole(scope, `rotation_lambda_role`, {
      namePrefix: `${prefix}-LambdaRotationRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
        scope,
        `lambda_rotation_assume_role_policy_document`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sts:AssumeRole'],
              principals: [
                {
                  type: 'Service',
                  identifiers: ['lambda.amazonaws.com'],
                },
              ],
              resources: ['*'],
            },
          ],
        }
      ).json,
      tags,
    });

    //Create the rotation lambda
    const lambda = new LambdaFunction(scope, `rotation_lambda`, {
      filename: lambdaArchive.outputPath,
      functionName: `${rds.clusterIdentifier}-MainPasswordRotation`,
      role: lambdaRole.arn,
      handler: 'index.lambda_handler',
      sourceCodeHash: lambdaArchive.outputBase64Sha256,
      runtime: 'python3.7',
      vpcConfig: [
        {
          securityGroupIds: securityGroupIds,
          subnetIds: subnetIds,
        },
      ],
    });

    //Give secrets manager the permission to run the function
    new LambdaPermission(scope, `rotation_lambda`, {
      functionName: lambda.functionName,
      statementId: 'AllowExecutionSecretManager',
      action: 'lambda:InvokeFunction',
      principal: 'secretsmanager.amazonaws.com',
    });

    //Create the secret
    const secret = new SecretsmanagerSecret(scope, `rds_secret`, {
      description: `Secret For ${rds.clusterIdentifier}`,
      name: `${prefix}/${rds.clusterIdentifier}`,
      rotationLambdaArn: lambda.arn,
      //We dont auto rotate, because our apps dont have triggers to refresh yet.
      //This is mainly so we can rotate after we create the RDS.
    });

    //Create the initial secret version
    new SecretsmanagerSecretVersion(scope, `rds_secret_version`, {
      secretId: secret.id,
      secretString: JSON.stringify({
        engine: 'mysql',
        host: rds.endpoint,
        username: rds.masterUsername,
        password: rds.masterPassword,
        dbname: rds.databaseName,
        port: rds.port,
      }),
    });

    //Create our rotation policy
    const rdsLambdaRotationPolicyDocument = new DataAwsIamPolicyDocument(
      scope,
      `rds_lambda_rotation_policy_document`,
      {
        statement: [
          {
            sid: 'Invoke Lambda',
            actions: [
              'lambda:GetFunction',
              'lambda:InvokeAsync',
              'lambda:InvokeFunction',
            ],
            resources: [lambda.arn],
          },
          {
            sid: 'Secrets Manager Admin',
            actions: ['secretsmanager:*'],
            resources: [secret.arn, `${secret.arn}*`],
          },
          {
            sid: 'VPC ENI policies',
            actions: [
              'ec2:DescribeNetworkInterfaces',
              'ec2:CreateNetworkInterfaces',
              'ec2:DeleteNetworkInterfaces',
            ],
            resources: ['*'],
          },
        ],
      }
    );

    const lambdaPolicy = new IamPolicy(scope, `rds_lambda_rotation_policy`, {
      namePrefix: `${prefix}-LambdaRotation`,
      policy: rdsLambdaRotationPolicyDocument.json,
    });

    //Attach the rotation policy to the role
    new IamRolePolicyAttachment(
      scope,
      `lambda_rotation_role_policy_attachment`,
      {
        role: lambdaRole.name,
        policyArn: lambdaPolicy.arn,
      }
    );

    return { secretARN: secret.arn };
  }
}

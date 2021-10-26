import { Fn, Resource } from 'cdktf';
import { AwsProvider, DataSources, KMS, SSM, VPC } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

export class PocketVPC extends Resource {
  public readonly vpc: VPC.DataAwsVpc;

  public readonly region: string;
  public readonly accountId: string;
  public readonly privateSubnetIds: string[];
  public readonly publicSubnetIds: string[];
  public readonly secretsManagerSecretKey: KMS.DataAwsKmsAlias;
  public readonly defaultSecurityGroups: VPC.DataAwsSecurityGroups;

  constructor(scope: Construct, name: string, awsProvider?: AwsProvider) {
    super(scope, name);

    const vpcSSMParam = new SSM.DataAwsSsmParameter(this, `vpc_ssm_param`, {
      provider: awsProvider,
      name: '/Shared/Vpc',
    });

    this.vpc = new VPC.DataAwsVpc(this, `vpc`, {
      provider: awsProvider,
      filter: [
        {
          name: 'vpc-id',
          values: [vpcSSMParam.value],
        },
      ],
    });

    const privateString = new SSM.DataAwsSsmParameter(this, `private_subnets`, {
      provider: awsProvider,
      name: '/Shared/PrivateSubnets',
    });

    const privateSubnets = new VPC.DataAwsSubnetIds(
      this,
      `private_subnet_ids`,
      {
        provider: awsProvider,
        vpcId: this.vpc.id,
        filter: [{
          name: 'subnet-id',
          values: Fn.split(",", privateString.value)
        }],
      }
    );

    this.privateSubnetIds = privateSubnets.ids;

    const publicString = new SSM.DataAwsSsmParameter(this, `public_subnets`, {
      provider: awsProvider,
      name: '/Shared/PublicSubnets',
    });

    const publicSubnets = new VPC.DataAwsSubnetIds(this, `public_subnet_ids`, {
      provider: awsProvider,
      vpcId: this.vpc.id,
      filter: [{
        name: 'subnet-id',
        values: Fn.split(",", publicString.value)
      }]
    });

    this.publicSubnetIds = publicSubnets.ids;

    const identity = new DataSources.DataAwsCallerIdentity(
      this,
      `current_identity`,
      {
        provider: awsProvider,
      }
    );
    this.accountId = identity.accountId;

    const region = new DataSources.DataAwsRegion(this, 'current_region', {
      provider: awsProvider,
    });
    this.region = region.name;

    this.secretsManagerSecretKey = new KMS.DataAwsKmsAlias(
      this,
      'secrets_manager_key',
      {
        provider: awsProvider,
        name: 'alias/aws/secretsmanager',
      }
    );

    this.defaultSecurityGroups = new VPC.DataAwsSecurityGroups(
      this,
      'default_security_groups',
      {
        provider: awsProvider,
        filter: [
          {
            name: 'group-name',
            values: ['default'],
          },
          {
            name: 'vpc-id',
            values: [this.vpc.id],
          },
        ],
      }
    );
  }
}

import { Fn, Resource } from 'cdktf';
import { AwsProvider, datasources, kms, ssm, vpc } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

export class PocketVPC extends Resource {
  public readonly vpc: vpc.DataAwsVpc;

  public readonly region: string;
  public readonly accountId: string;
  public readonly privateSubnetIds: string[];
  public readonly publicSubnetIds: string[];
  public readonly secretsManagerSecretKey: kms.DataAwsKmsAlias;
  public readonly defaultSecurityGroups: vpc.DataAwsSecurityGroups;

  constructor(scope: Construct, name: string, provider?: AwsProvider) {
    super(scope, name);

    const vpcSSMParam = new ssm.DataAwsSsmParameter(this, `vpc_ssm_param`, {
      provider: provider,
      name: '/Shared/Vpc',
    });

    this.vpc = new vpc.DataAwsVpc(this, `vpc`, {
      provider: provider,
      filter: [
        {
          name: 'vpc-id',
          values: [vpcSSMParam.value],
        },
      ],
    });

    const privateString = new ssm.DataAwsSsmParameter(this, `private_subnets`, {
      provider: provider,
      name: '/Shared/PrivateSubnets',
    });

    const privateSubnets = new vpc.DataAwsSubnetIds(
      this,
      `private_subnet_ids`,
      {
        provider: provider,
        vpcId: this.vpc.id,
        filter: [
          {
            name: 'subnet-id',
            values: Fn.split(',', privateString.value),
          },
        ],
      }
    );

    this.privateSubnetIds = privateSubnets.ids;

    const publicString = new ssm.DataAwsSsmParameter(this, `public_subnets`, {
      provider: provider,
      name: '/Shared/PublicSubnets',
    });

    const publicSubnets = new vpc.DataAwsSubnetIds(this, `public_subnet_ids`, {
      provider: provider,
      vpcId: this.vpc.id,
      filter: [
        {
          name: 'subnet-id',
          values: Fn.split(',', publicString.value),
        },
      ],
    });

    this.publicSubnetIds = publicSubnets.ids;

    const identity = new datasources.DataAwsCallerIdentity(
      this,
      `current_identity`,
      {
        provider: provider,
      }
    );
    this.accountId = identity.accountId;

    const region = new datasources.DataAwsRegion(this, 'current_region', {
      provider: provider,
    });
    this.region = region.name;

    this.secretsManagerSecretKey = new kms.DataAwsKmsAlias(
      this,
      'secrets_manager_key',
      {
        provider: provider,
        name: 'alias/aws/secretsmanager',
      }
    );

    this.defaultSecurityGroups = new vpc.DataAwsSecurityGroups(
      this,
      'default_security_groups',
      {
        provider: provider,
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

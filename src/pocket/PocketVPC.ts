import { Resource } from 'cdktf';
import {
  DataAwsCallerIdentity,
  DataAwsRegion,
  DataAwsSsmParameter,
  DataAwsSubnetIds,
  DataAwsVpc,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

export class PocketVPC extends Resource {
  public readonly vpc: DataAwsVpc;

  public readonly region: string;
  public readonly accountId: string;
  public readonly privateSubnetIds: string[];
  public readonly publicSubnetIds: string[];

  constructor(scope: Construct, name: string) {
    super(scope, name);

    const vpcSSMParam = new DataAwsSsmParameter(this, `${name}_vpc_ssm_param`, {
      name: '/Shared/Vpc',
    });

    this.vpc = new DataAwsVpc(this, `${name}_vpc`, {
      filter: [
        {
          name: 'vpc-id',
          values: [vpcSSMParam.value],
        },
      ],
    });

    const privateString = new DataAwsSsmParameter(
      this,
      `${name}_private_subnets`,
      {
        name: '/Shared/PrivateSubnets',
      }
    );

    const privateSubnets = new DataAwsSubnetIds(
      this,
      `${name}_private_subnet_ids`,
      {
        vpcId: this.vpc.id,
        filter: [
          {
            name: 'subnet-id',
            values: privateString.value.split(','),
          },
        ],
      }
    );
    this.privateSubnetIds = privateSubnets.ids;

    const publicString = new DataAwsSsmParameter(
      this,
      `${name}_public_subnets`,
      {
        name: '/Shared/PublicSubnets',
      }
    );

    const publicSubnets = new DataAwsSubnetIds(
      this,
      `${name}_public_subnet_ids`,
      {
        vpcId: this.vpc.id,
        filter: [
          {
            name: 'subnet-id',
            values: publicString.value.split(','),
          },
        ],
      }
    );
    this.publicSubnetIds = publicSubnets.ids;

    const identity = new DataAwsCallerIdentity(
      this,
      `${name}_current_identity`
    );
    this.accountId = identity.accountId;

    const region = new DataAwsRegion(this, 'current_region');
    this.region = region.name;
  }
}

import { Resource } from 'cdktf';
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
      }
    );

    // hi, how are you? good? great. why don't you grab a beverage and have a seat.
    // so, you know, there are times in life where we do things we aren't proud of,
    // but they need to be done. sometimes you have a pb&j for dinner, right? not
    // gonna go to social media with that meal, but hey, groceries get slim. and
    // you gotta eat something.
    //
    // so what you're about to see below is, to be frank, a horror show. it's bad.
    // it's a dirty, dirty hack. but groceries were slim. it's all the food we had.
    //
    // we can't split the privateString in typescript because it's a data block
    // (meaning the data doesn't exist in typescript), so we have to split in
    // the json. why don't we just pass ${privateString.value} you say? well because
    // that generates invalid syntax when syntesized to json (an extra nested ${}).
    // this was the compromise we came to.
    //
    // don't look at it too long. just be happy that it works, and that this code
    // only has to exist in one place. and maybe, just maybe, someday we'll be
    // able to clean this mess.
    privateSubnets.addOverride('filter', [
      {
        name: 'subnet-id',
        values: `\${split(",", ${privateString.fqn}.value)}`,
      },
    ]);

    this.privateSubnetIds = privateSubnets.ids;

    const publicString = new SSM.DataAwsSsmParameter(this, `public_subnets`, {
      provider: awsProvider,
      name: '/Shared/PublicSubnets',
    });

    const publicSubnets = new VPC.DataAwsSubnetIds(this, `public_subnet_ids`, {
      provider: awsProvider,
      vpcId: this.vpc.id,
    });

    // don't look at me! i'm hideous!
    publicSubnets.addOverride('filter', [
      {
        name: 'subnet-id',
        values: `\${split(",", ${publicString.fqn}.value)}`,
      },
    ]);

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

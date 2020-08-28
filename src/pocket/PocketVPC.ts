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

    const vpcSSMParam = new DataAwsSsmParameter(this, `vpc_ssm_param`, {
      name: '/Shared/Vpc',
    });

    this.vpc = new DataAwsVpc(this, `vpc`, {
      filter: [
        {
          name: 'vpc-id',
          values: [vpcSSMParam.value],
        },
      ],
    });

    const privateString = new DataAwsSsmParameter(this, `private_subnets`, {
      name: '/Shared/PrivateSubnets',
    });

    const privateSubnets = new DataAwsSubnetIds(this, `private_subnet_ids`, {
      vpcId: this.vpc.id,
    });

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

    const publicString = new DataAwsSsmParameter(this, `public_subnets`, {
      name: '/Shared/PublicSubnets',
    });

    const publicSubnets = new DataAwsSubnetIds(this, `public_subnet_ids`, {
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

    const identity = new DataAwsCallerIdentity(this, `current_identity`);
    this.accountId = identity.accountId;

    const region = new DataAwsRegion(this, 'current_region');
    this.region = region.name;
  }
}

import { Resource } from 'cdktf';
import { vpc, elb } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

export interface ApplicationLoadBalancerProps {
  prefix: string;
  alb6CharacterPrefix: string;
  vpcId: string;
  subnetIds: string[];
  internal?: boolean;
  tags?: { [key: string]: string };
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationLoadBalancer extends Resource {
  public readonly alb: elb.Alb;
  public readonly securityGroup: vpc.SecurityGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationLoadBalancerProps
  ) {
    super(scope, name);

    this.securityGroup = new vpc.SecurityGroup(this, `alb_security_group`, {
      namePrefix: `${config.prefix}-HTTP/S Security Group`,
      description: 'External security group  (Managed by Terraform)',
      vpcId: config.vpcId,
      ingress: [
        {
          fromPort: 443,
          toPort: 443,
          protocol: 'TCP',
          cidrBlocks: ['0.0.0.0/0'],
        },
        {
          fromPort: 80,
          toPort: 80,
          protocol: 'TCP',
          cidrBlocks: ['0.0.0.0/0'],
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
      tags: {
        ...config.tags,
        Name: `${config.prefix}-HTTP/S Security Group`,
      },
      lifecycle: {
        createBeforeDestroy: true,
      },
    });

    this.alb = new elb.Alb(this, `alb`, {
      namePrefix: config.alb6CharacterPrefix,
      securityGroups: [this.securityGroup.id],
      internal: config.internal !== undefined ? config.internal : false,
      subnets: config.subnetIds,
      tags: config.tags,
    });
  }
}

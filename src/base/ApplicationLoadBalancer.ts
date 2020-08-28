import { Resource } from 'cdktf';
import { Alb, SecurityGroup } from '../../.gen/providers/aws';
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
  public readonly alb: Alb;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationLoadBalancerProps
  ) {
    super(scope, name);

    const ingressSecurityGroup = new SecurityGroup(this, `alb_security_group`, {
      name: `${config.prefix}-HTTP/S Security Group`,
      description: 'External security group',
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
          fromPort: 80,
          toPort: 80,
          protocol: 'TCP',
          cidrBlocks: ['0.0.0.0/0'],
        },
      ],
      tags: {
        ...config.tags,
        Name: `${config.prefix}-HTTP/S Security Group`,
      },
    });

    // the following are included due to a bug
    // https://github.com/hashicorp/terraform-cdk/issues/223
    ingressSecurityGroup.addOverride('ingress.0.description', null);
    ingressSecurityGroup.addOverride('ingress.0.ipv6_cidr_blocks', null);
    ingressSecurityGroup.addOverride('ingress.0.prefix_list_ids', null);
    ingressSecurityGroup.addOverride('ingress.0.security_groups', null);
    ingressSecurityGroup.addOverride('ingress.0.self', null);

    ingressSecurityGroup.addOverride('ingress.1.description', null);
    ingressSecurityGroup.addOverride('ingress.1.ipv6_cidr_blocks', null);
    ingressSecurityGroup.addOverride('ingress.1.prefix_list_ids', null);
    ingressSecurityGroup.addOverride('ingress.1.security_groups', null);
    ingressSecurityGroup.addOverride('ingress.1.self', null);

    ingressSecurityGroup.addOverride('egress.0.description', null);
    ingressSecurityGroup.addOverride('egress.0.ipv6_cidr_blocks', null);
    ingressSecurityGroup.addOverride('egress.0.prefix_list_ids', null);
    ingressSecurityGroup.addOverride('egress.0.security_groups', null);
    ingressSecurityGroup.addOverride('egress.0.self', null);

    this.alb = new Alb(this, `alb`, {
      namePrefix: config.alb6CharacterPrefix,
      securityGroups: [ingressSecurityGroup.id],
      internal: config.internal !== undefined ? config.internal : false,
      subnets: config.subnetIds,
      tags: config.tags,
    });
  }
}

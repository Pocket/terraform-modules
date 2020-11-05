import { Resource } from 'cdktf';
import {
  Alb,
  AlbTargetGroup,
  AlbTargetGroupConfig,
  SecurityGroup,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

export interface ApplicationLoadBalancerProps {
  prefix: string;
  alb6CharacterPrefix: string;
  vpcId: string;
  subnetIds: string[];
  internal?: boolean;
  targetGroup: AlbTargetGroupConfig;
  tags?: { [key: string]: string };
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationLoadBalancer extends Resource {
  public readonly alb: Alb;
  public readonly securityGroup: SecurityGroup;
  public readonly albTargetGroup: AlbTargetGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationLoadBalancerProps
  ) {
    super(scope, name);

    this.securityGroup = new SecurityGroup(this, `alb_security_group`, {
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
      lifecycle: {
        createBeforeDestroy: true,
      },
    });

    // the following are included due to a bug
    // https://github.com/hashicorp/terraform-cdk/issues/223
    this.securityGroup.addOverride('ingress.0.description', null);
    this.securityGroup.addOverride('ingress.0.ipv6_cidr_blocks', null);
    this.securityGroup.addOverride('ingress.0.prefix_list_ids', null);
    this.securityGroup.addOverride('ingress.0.security_groups', null);
    this.securityGroup.addOverride('ingress.0.self', null);

    this.securityGroup.addOverride('ingress.1.description', null);
    this.securityGroup.addOverride('ingress.1.ipv6_cidr_blocks', null);
    this.securityGroup.addOverride('ingress.1.prefix_list_ids', null);
    this.securityGroup.addOverride('ingress.1.security_groups', null);
    this.securityGroup.addOverride('ingress.1.self', null);

    this.securityGroup.addOverride('egress.0.description', null);
    this.securityGroup.addOverride('egress.0.ipv6_cidr_blocks', null);
    this.securityGroup.addOverride('egress.0.prefix_list_ids', null);
    this.securityGroup.addOverride('egress.0.security_groups', null);
    this.securityGroup.addOverride('egress.0.self', null);

    this.alb = new Alb(this, `alb`, {
      namePrefix: config.alb6CharacterPrefix,
      securityGroups: [this.securityGroup.id],
      internal: config.internal !== undefined ? config.internal : false,
      subnets: config.subnetIds,
      tags: config.tags,
    });

    this.albTargetGroup = new AlbTargetGroup(this, `alb_target_group`, {
      ...config.targetGroup,
      dependsOn: [this.alb],
    });
  }
}

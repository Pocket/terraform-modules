import { Resource } from 'cdktf';
import { route53 } from '@cdktf/provider-aws';
const { DataAwsRoute53Zone, Route53Record, Route53Zone } = route53;
import { Construct } from 'constructs';
import { getRootDomain } from '../utilities';

export interface RootDNSProps {
  domain: string;
  tags?: { [key: string]: string };
}

export class ApplicationBaseDNS extends Resource {
  public readonly zoneId: string;

  constructor(scope: Construct, name: string, config: RootDNSProps) {
    super(scope, name);

    const route53MainZone = ApplicationBaseDNS.retrieveAwsRoute53Zone(
      scope,
      name,
      config.domain
    );

    const route53SubZone = ApplicationBaseDNS.generateRoute53Zone(
      this,
      config.domain,
      config.tags
    );

    this.zoneId = route53SubZone.zoneId;

    ApplicationBaseDNS.generateRoute53Record(
      this,
      config.domain,
      route53MainZone.zoneId,
      route53SubZone.nameServers
    );
  }

  static retrieveAwsRoute53Zone(
    scope: Construct,
    name: string,
    domain: string
  ): route53.DataAwsRoute53Zone {
    return new DataAwsRoute53Zone(scope, `${name}_main_hosted_zone`, {
      name: getRootDomain(domain),
    });
  }

  static generateRoute53Zone(
    resource: Resource,
    domain: string,
    tags?: { [key: string]: string }
  ): route53.Route53Zone {
    return new Route53Zone(resource, `subhosted_zone`, {
      name: domain,
      tags: tags,
    });
  }

  static generateRoute53Record(
    resource: Resource,
    name: string,
    zoneId: string,
    records: string[]
  ): void {
    new Route53Record(resource, `subhosted_zone_ns`, {
      name,
      type: 'NS',
      ttl: 86400,
      zoneId,
      records,
    });
  }
}

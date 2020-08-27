import { Resource } from 'cdktf';
import {
  DataAwsRoute53Zone,
  Route53Record,
  Route53Zone,
} from '../../.gen/providers/aws';
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

    const route53MainZone = new DataAwsRoute53Zone(
      scope,
      `${name}_main_hosted_zone`,
      {
        name: getRootDomain(config.domain),
        tags: config.tags,
      }
    );

    const route53SubZone = new Route53Zone(this, `${name}_subhosted_zone`, {
      name: config.domain,
      tags: config.tags,
    });

    this.zoneId = route53SubZone.zoneId;

    new Route53Record(this, `${name}_subhosted_zone_ns`, {
      name: config.domain,
      type: 'NS',
      ttl: 86400,
      zoneId: route53MainZone.zoneId,
      records: route53SubZone.nameServers,
    });
  }
}

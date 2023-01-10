import { Resource, TerraformMetaArguments, TerraformProvider } from 'cdktf';
import { route53 } from '@cdktf/provider-aws';
const { DataAwsRoute53Zone, Route53Record, Route53Zone } = route53;
import { Construct } from 'constructs';
import { getRootDomain } from '../utilities';

export interface RootDNSProps extends TerraformMetaArguments {
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
      config.domain,
      config.provider
    );

    const route53SubZone = ApplicationBaseDNS.generateRoute53Zone(
      this,
      config.domain,
      config.tags,
      config.provider
    );

    this.zoneId = route53SubZone.zoneId;

    ApplicationBaseDNS.generateRoute53Record(
      this,
      config.domain,
      route53MainZone.zoneId,
      route53SubZone.nameServers,
      config.provider
    );
  }

  static retrieveAwsRoute53Zone(
    scope: Construct,
    name: string,
    domain: string,
    provider?: TerraformProvider
  ): route53.DataAwsRoute53Zone {
    return new DataAwsRoute53Zone(scope, `${name}_main_hosted_zone`, {
      name: getRootDomain(domain),
      provider: provider,
    });
  }

  static generateRoute53Zone(
    resource: Resource,
    domain: string,
    tags?: { [key: string]: string },
    provider?: TerraformProvider
  ): route53.Route53Zone {
    return new Route53Zone(resource, `subhosted_zone`, {
      name: domain,
      tags: tags,
      provider: provider,
    });
  }

  static generateRoute53Record(
    resource: Resource,
    name: string,
    zoneId: string,
    records: string[],
    provider?: TerraformProvider
  ): void {
    new Route53Record(resource, `subhosted_zone_ns`, {
      name,
      type: 'NS',
      ttl: 86400,
      zoneId,
      records,
      provider: provider,
    });
  }
}

import { Resource } from 'cdktf';
import {
  CloudfrontDistribution,
  Route53Record,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';
import { ApplicationBaseDNS } from '..';
import { ApplicationCertificate } from '..';
import { ApplicationLoadBalancer } from '..';
import { PocketVPC } from './PocketVPC';

export interface PocketALBApplicationProps {
  prefix: string;
  alb6CharacterPrefix: string;
  internal?: boolean;
  domain: string;
  cdn?: boolean;
  tags?: { [key: string]: string };
}

export class PocketALBApplication extends Resource {
  public readonly alb: ApplicationLoadBalancer;
  public readonly baseDNS: ApplicationBaseDNS;

  constructor(
    scope: Construct,
    name: string,
    config: PocketALBApplicationProps
  ) {
    super(scope, name);

    config = PocketALBApplication.validateConfig(config);

    const pocketVPC = new PocketVPC(this, `pocket_vpc`);

    //Setup the Base DNS stack for our application which includes a hosted SubZone
    this.baseDNS = new ApplicationBaseDNS(this, `base_dns`, {
      domain: config.domain,
      tags: config.tags,
    });

    const { alb, albRecord } = this.createALB(config, pocketVPC);
    this.alb = alb;

    if (config.cdn) {
      this.createCDN(config, albRecord);
    }
  }

  /**
   * Validate the Configuration
   *
   * @param config
   * @private
   */
  private static validateConfig(
    config: PocketALBApplicationProps
  ): PocketALBApplicationProps {
    if (config.cdn === undefined) {
      //Set a default of cached to false
      config.cdn = false;
    }

    if (config.internal === undefined) {
      //Set a default of internal to false
      config.internal = false;
    }

    if (config.internal && config.cdn) {
      throw Error('You can not have a cached ALB and have it be internal.');
    }

    return config;
  }

  /**
   * Creates the ALB stack and certificates
   * @param name
   * @param config
   * @param pocketVPC
   * @private
   */
  private createALB(
    config: PocketALBApplicationProps,
    pocketVPC: PocketVPC
  ): { alb: ApplicationLoadBalancer; albRecord: Route53Record } {
    //Create our application Load Balancer
    const alb = new ApplicationLoadBalancer(this, `application_load_balancer`, {
      vpcId: pocketVPC.vpc.id,
      prefix: config.prefix,
      alb6CharacterPrefix: config.alb6CharacterPrefix,
      subnetIds: config.internal
        ? pocketVPC.privateSubnetIds
        : pocketVPC.publicSubnetIds,
      internal: config.internal,
      tags: config.tags,
    });

    let albDomainName = config.domain;

    if (config.cdn) {
      //When the app uses a CDN we set the ALB to be direct.app-domain
      //Then the CDN is our main app.
      albDomainName = `direct.${albDomainName}`;
    }

    //Sets up the record for the ALB.
    const albRecord = new Route53Record(this, `alb_record`, {
      name: albDomainName,
      setIdentifier: alb.alb.name,
      type: 'A',
      zoneId: this.baseDNS.zoneId,
      weightedRoutingPolicy: [
        {
          weight: 1,
        },
      ],
      alias: [
        {
          name: alb.alb.dnsName,
          zoneId: alb.alb.zoneId,
          evaluateTargetHealth: true,
        },
      ],
      lifecycle: {
        ignoreChanges: ['weighted_routing_policy[0].weight'],
      },
    });

    //Creates the Certificate for the ALB
    new ApplicationCertificate(this, `alb_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: albDomainName,
      tags: config.tags,
    });

    return { alb, albRecord };
  }

  /**
   * Create the CDN if the ALB is backed by one.
   *
   * @param config
   * @param albRecord
   * @private
   */
  private createCDN(
    config: PocketALBApplicationProps,
    albRecord: Route53Record
  ): void {
    //Create the certificate for the CDN
    const cdnCertificate = new ApplicationCertificate(this, `cdn_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: config.domain,
      tags: config.tags,
    });

    //Create the CDN
    const cdn = new CloudfrontDistribution(this, `cloudfront_distribution`, {
      comment: `CDN for direct.${config.domain}`,
      enabled: true,
      aliases: [config.domain],
      priceClass: 'PriceClass_200',
      tags: config.tags,
      origin: [
        {
          domainName: albRecord.fqdn,
          originId: 'Alb',
          customOriginConfig: [
            {
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: 'https-only',
              originSslProtocols: ['TLSv1.1', 'TLSv1.2'],
            },
          ],
        },
      ],
      defaultCacheBehavior: [
        {
          targetOriginId: 'Alb',
          viewerProtocolPolicy: 'redirect-to-https',
          compress: true,
          allowedMethods: [
            'GET',
            'HEAD',
            'OPTIONS',
            'PUT',
            'POST',
            'PATCH',
            'DELETE',
          ],
          cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
          forwardedValues: [
            {
              queryString: true,
              headers: ['Accept', 'Origin', 'Authorization'], //This is important for apollo because it serves different responses based on this
              cookies: [
                {
                  forward: 'none',
                },
              ],
            },
          ],
        },
      ],
      viewerCertificate: [
        {
          acmCertificateArn: cdnCertificate.arn,
          sslSupportMethod: 'sni-only',
          minimumProtocolVersion: 'TLSv1.1_2016',
        },
      ],
      restrictions: [
        {
          geoRestriction: [
            {
              restrictionType: 'none',
            },
          ],
        },
      ],
    });

    //When cached the CDN must point to the Load Balancer
    new Route53Record(this, `cdn_record`, {
      name: config.domain,
      setIdentifier: albRecord.setIdentifier,
      type: 'A',
      zoneId: this.baseDNS.zoneId,
      weightedRoutingPolicy: [
        {
          weight: 1,
        },
      ],
      alias: [
        {
          name: cdn.domainName,
          zoneId: cdn.hostedZoneId,
          evaluateTargetHealth: true,
        },
      ],
      lifecycle: {
        ignoreChanges: ['weighted_routing_policy[0].weight'],
      },
    });
  }
}

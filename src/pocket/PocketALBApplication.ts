import { Resource } from 'cdktf';
import {
  CloudfrontDistribution,
  Route53Record,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';
import { ApplicationBaseDNS } from '../base/ApplicationBaseDNS';
import { ApplicationCertificate } from '../base/ApplicationCertificate';
import { ApplicationLoadBalancer } from '../base/ApplicationLoadBalancer';
import { PocketVPC } from './PocketVPC';

export interface PocketALBApplicationProps {
  prefix: string;
  alb6CharacterPrefix: string;
  internal?: boolean;
  rootDomain: string; //TODO: Parse out the root domain.
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

    const pocketVPC = new PocketVPC(this, `${name}_pocket_vpc`);

    //Setup the Base DNS stack for our application which includes a hosted SubZone
    this.baseDNS = new ApplicationBaseDNS(this, `${name}_base_dns`, {
      rootDomain: config.rootDomain,
      domain: config.domain,
      tags: config.tags,
    });

    //Create our application Load Balancer
    this.alb = new ApplicationLoadBalancer(
      this,
      `${name}_application_load_balancer`,
      {
        vpcId: pocketVPC.vpc.id,
        prefix: config.prefix,
        alb6CharacterPrefix: config.alb6CharacterPrefix,
        subnetIds: config.internal
          ? pocketVPC.privateSubnetIds
          : pocketVPC.publicSubnetIds,
        internal: config.internal,
        tags: config.tags,
      }
    );

    const mainAppDomain = config.domain;
    let albDomainName = mainAppDomain;
    if (config.cdn) {
      //When the app uses a CDN we set the ALB to be direct.app-domain
      //Then the CDN is our main app.
      albDomainName = `direct.${mainAppDomain}`;
    }

    //Sets up the record for the ALB.
    const albRecord = new Route53Record(this, `${name}_alb_record`, {
      name: albDomainName,
      type: 'A',
      zoneId: this.baseDNS.zoneId,
      weightedRoutingPolicy: [
        {
          weight: 1,
        },
      ],
      alias: [
        {
          name: this.alb.alb.dnsName,
          zoneId: this.alb.alb.zoneId,
          evaluateTargetHealth: true,
        },
      ],
      lifecycle: {
        ignoreChanges: ['weighted_routing_policy[0].weight'],
      },
    });

    //Creates the Certificate for the ALB
    new ApplicationCertificate(this, `${name}_alb_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: albDomainName,
      tags: config.tags,
    });

    if (config.cdn) {
      //Create the certificate for the CDN
      const cdnCertificate = new ApplicationCertificate(
        this,
        `${name}_cdn_certificate`,
        {
          zoneId: this.baseDNS.zoneId,
          domain: mainAppDomain,
          tags: config.tags,
        }
      );

      //Create the CDN
      const cdn = new CloudfrontDistribution(
        this,
        `${name}_cloudfront_distribution`,
        {
          comment: `CDN for direct.${config.domain}`,
          enabled: true,
          aliases: [mainAppDomain],
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
        }
      );

      //When cached the CDN must point to the Load Balancer
      new Route53Record(this, `${name}_cdn_record`, {
        name: mainAppDomain,
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
}

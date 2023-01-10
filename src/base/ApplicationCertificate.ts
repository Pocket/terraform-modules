import { Resource, TerraformMetaArguments, TerraformProvider } from 'cdktf';
import { route53, acm } from '@cdktf/provider-aws';
const { DataAwsRoute53Zone, Route53Record } = route53;
const { AcmCertificate, AcmCertificateValidation } = acm;
import { Construct } from 'constructs';

export interface ApplicationCertificateProps extends TerraformMetaArguments {
  domain: string;
  /**
   * If zoneId is not passed then we use a data block and the zoneDomain to grab it.
   */
  zoneId?: string;
  zoneDomain?: string;
  tags?: { [key: string]: string };
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationCertificate extends Resource {
  public readonly arn: string;
  // Use `certificateValidation` in `dependsOn` to block on the
  // complete certificate for any downstream dependencies
  public readonly certificateValidation: acm.AcmCertificateValidation;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationCertificateProps
  ) {
    super(scope, name);

    if (!config.zoneId && config.zoneDomain) {
      const route53Zone = new DataAwsRoute53Zone(this, `zone`, {
        name: config.zoneDomain,
        provider: config.provider,
      });
      config.zoneId = route53Zone.zoneId;
    } else if (!config.zoneId && !config.zoneDomain) {
      throw new Error('You need to pass either a zone id or a zone domain');
    }

    const certificate = ApplicationCertificate.generateAcmCertificate(
      this,
      config.domain,
      config.tags,
      config.provider
    );

    const certificateRecord = ApplicationCertificate.generateRoute53Record(
      this,
      config.zoneId,
      certificate,
      config.provider
    );

    const validation = ApplicationCertificate.generateAcmCertificateValidation(
      this,
      certificate,
      certificateRecord,
      config.provider
    );

    this.arn = certificate.arn;
    this.certificateValidation = validation;
  }

  static generateAcmCertificate(
    resource: Resource,
    domain: string,
    tags?: { [key: string]: string },
    provider?: TerraformProvider
  ): acm.AcmCertificate {
    return new AcmCertificate(resource, `certificate`, {
      domainName: domain,
      validationMethod: 'DNS',
      tags: tags,
      lifecycle: {
        createBeforeDestroy: true,
      },
      provider: provider,
    });
  }

  static generateRoute53Record(
    resource: Resource,
    zoneId: string,
    cert: acm.AcmCertificate,
    provider?: TerraformProvider
  ): route53.Route53Record {
    const record = new Route53Record(resource, `certificate_record`, {
      name: cert.domainValidationOptions.get(0).resourceRecordName,
      type: cert.domainValidationOptions.get(0).resourceRecordType,
      zoneId,
      records: [cert.domainValidationOptions.get(0).resourceRecordValue],
      ttl: 60,
      dependsOn: [cert],
      provider: provider,
    });

    return record;
  }

  static generateAcmCertificateValidation(
    resource: Resource,
    cert: acm.AcmCertificate,
    record: route53.Route53Record,
    provider?: TerraformProvider
  ): acm.AcmCertificateValidation {
    return new AcmCertificateValidation(resource, `certificate_validation`, {
      certificateArn: cert.arn,
      validationRecordFqdns: [record.fqdn],
      dependsOn: [record, cert],
      provider: provider,
    });
  }
}

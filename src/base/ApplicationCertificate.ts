import { Resource } from 'cdktf';
import {
  DataAwsRoute53Zone,
  AcmCertificate,
  Route53Record,
  AcmCertificateValidation,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

export interface ApplicationCertificateProps {
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

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationCertificateProps
  ) {
    super(scope, name);

    if (!config.zoneId && config.zoneDomain) {
      const route53Zone = new DataAwsRoute53Zone(this, `zone`, {
        name: config.zoneDomain,
      });
      config.zoneId = route53Zone.zoneId;
    } else if (!config.zoneId && !config.zoneDomain) {
      throw new Error('You need to pass either a zone id or a zone domain');
    }

    const certificate = ApplicationCertificate.generateAcmCertificate(
      this,
      config.domain,
      config.tags
    );

    const certificateRecord = ApplicationCertificate.generateRoute53Record(
      this,
      config.zoneId,
      certificate
    );

    ApplicationCertificate.generateAcmCertificateValidation(
      this,
      certificate,
      certificateRecord
    );

    this.arn = certificate.arn;
  }

  static generateAcmCertificate(
    resource: Resource,
    domain: string,
    tags?: { [key: string]: string }
  ): AcmCertificate {
    return new AcmCertificate(resource, `certificate`, {
      domainName: domain,
      validationMethod: 'DNS',
      tags: tags,
      lifecycle: {
        createBeforeDestroy: true,
      },
    });
  }

  static generateRoute53Record(
    resource: Resource,
    zoneId: string,
    cert: AcmCertificate
  ): Route53Record {
    const record = new Route53Record(resource, `certificate_record`, {
      name: cert.domainValidationOptions('0').resourceRecordName,
      type: cert.domainValidationOptions('0').resourceRecordType,
      zoneId,
      records: [],
      ttl: 60,
      dependsOn: [cert],
    });

    // there appears to be an aws / cdk versioning mismatch .the above references to
    // certificate.domainValidationOptions fail due to aws using a set instead of a list
    // (but cdk doesn't know this yet). so, we force it.
    record.addOverride(
      'name',
      `\${tolist(${cert.fqn}.domain_validation_options)[0].resource_record_name}`
    );

    record.addOverride(
      'type',
      `\${tolist(${cert.fqn}.domain_validation_options)[0].resource_record_type}`
    );

    record.addOverride('records', [
      `\${tolist(${cert.fqn}.domain_validation_options)[0].resource_record_value}`,
    ]);

    return record;
  }

  static generateAcmCertificateValidation(
    resource: Resource,
    cert: AcmCertificate,
    record: Route53Record
  ): void {
    new AcmCertificateValidation(resource, `certificate_validation`, {
      certificateArn: cert.arn,
      validationRecordFqdns: [record.fqdn],
      dependsOn: [record, cert],
    });
  }
}

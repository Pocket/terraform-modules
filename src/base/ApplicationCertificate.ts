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
      const route53Zone = new DataAwsRoute53Zone(scope, `${name}_zone`, {
        name: config.zoneDomain,
      });
      config.zoneId = route53Zone.zoneId;
    } else if (!config.zoneId && !config.zoneDomain) {
      throw new Error('You need to pass either a zone id or a zone domain');
    }

    const certificate = new AcmCertificate(scope, `${name}_certificate`, {
      domainName: config.domain,
      validationMethod: 'DNS',
      tags: config.tags,
      lifecycle: {
        createBeforeDestroy: true,
      },
    });

    const certificateRecord = new Route53Record(
      scope,
      `${name}_certificate_record`,
      {
        name: certificate.domainValidationOptions('0').resourceRecordName,
        type: certificate.domainValidationOptions('0').resourceRecordType,
        zoneId: config.zoneId,
        records: [certificate.domainValidationOptions('0').resourceRecordValue],
        ttl: 60,
        dependsOn: [certificate],
      }
    );

    new AcmCertificateValidation(scope, `${name}_certificate_validation`, {
      certificateArn: certificate.arn,
      validationRecordFqdns: [certificateRecord.fqdn],
      dependsOn: [certificateRecord, certificate],
    });

    this.arn = certificate.arn;
  }
}

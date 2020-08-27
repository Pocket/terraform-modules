import { Resource } from 'cdktf';
import {
  DataAwsRoute53Zone,
  AcmCertificate,
  Route53Record,
  AcmCertificateValidation,
  AwsProvider,
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
        records: [],
        ttl: 60,
        dependsOn: [certificate],
      }
    );

    // there appears to be an aws / cdk versioning mismatch .the above references to
    // certificate.domainValidationOptions fail due to aws using a set instead of a list
    // (but cdk doesn't know this yet). so, we force it.
    certificateRecord.addOverride(
      'name',
      `tolist(aws_acm_certificate.${certificate.id}.domain_validation_options)[0].resource_record_name`
    );

    certificateRecord.addOverride(
      'type',
      `tolist(aws_acm_certificate.${certificate.id}.domain_validation_options)[0].resource_record_type`
    );

    certificateRecord.addOverride('records', [
      `tolist(aws_acm_certificate.${certificate.id}.domain_validation_options)[0].resource_record_value`,
    ]);

    new AcmCertificateValidation(scope, `${name}_certificate_validation`, {
      certificateArn: certificate.arn,
      validationRecordFqdns: [certificateRecord.fqdn],
      dependsOn: [certificateRecord, certificate],
    });

    this.arn = certificate.arn;
  }
}

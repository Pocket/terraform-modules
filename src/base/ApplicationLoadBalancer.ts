import { Alb, AlbAccessLogs, AlbConfig } from '@cdktf/provider-aws/lib/alb';
import { DataAwsElbServiceAccount } from '@cdktf/provider-aws/lib/data-aws-elb-service-account';
import { DataAwsIamPolicyDocument } from '@cdktf/provider-aws/lib/data-aws-iam-policy-document';
import { DataAwsS3Bucket } from '@cdktf/provider-aws/lib/data-aws-s3-bucket';
import { S3Bucket } from '@cdktf/provider-aws/lib/s3-bucket';
import { S3BucketPolicy } from '@cdktf/provider-aws/lib/s3-bucket-policy';
import { SecurityGroup } from '@cdktf/provider-aws/lib/security-group';
import { TerraformMetaArguments, TerraformProvider } from 'cdktf';
import { Construct } from 'constructs';

export interface ApplicationLoadBalancerProps extends TerraformMetaArguments {
  prefix: string;
  alb6CharacterPrefix: string;
  vpcId: string;
  subnetIds: string[];
  internal?: boolean;
  /**
   * Optional config to dump alb logs to a bucket.
   */
  accessLogs?: {
    /**
     * Existing bucket to dump alb logs too, one of existingBucket or bucket must be chosen.
     */
    existingBucket?: string;

    /**
     * Bucket to dump alb logs too, one of existingBucket or bucket must be chosen.
     */
    bucket?: string;

    /**
     * Optional bucket path prefix. If not defined will use server-logs/{service-name}/internal-alb/AWSLogs/{awsaccountid}/elasticloadbalancing/
     * Be sure to include a trailing /
     */
    prefix?: string;
  };
  tags?: { [key: string]: string };
}

/**
 * Generates an Application Certificate given a domain name and zoneId
 */
export class ApplicationLoadBalancer extends Construct {
  public readonly alb: Alb;
  public readonly securityGroup: SecurityGroup;

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
          fromPort: 0,
          protocol: '-1',
          toPort: 0,
          cidrBlocks: ['0.0.0.0/0'],
          description: 'required',
          ipv6CidrBlocks: [],
          prefixListIds: [],
          securityGroups: [],
        },
      ],
      tags: {
        ...config.tags,
        Name: `${config.prefix}-HTTP/S Security Group`,
      },
      lifecycle: {
        createBeforeDestroy: true,
      },
      provider: config.provider,
    });

    let logsConfig: AlbAccessLogs = undefined;
    if (config.accessLogs !== undefined) {
      const defaultPrefix = `server-logs/${config.prefix.toLowerCase()}/alb`;

      const prefix =
        config.accessLogs.prefix === undefined
          ? defaultPrefix
          : config.accessLogs.prefix;

      if (
        prefix.charAt(prefix.length - 1) === '/' ||
        prefix.charAt(0) === '/'
      ) {
        throw new Error("Logs prefix cannot start or end with '/'");
      }

      const bucket = this.getOrCreateBucket({
        bucket: config.accessLogs.bucket,
        existingBucket: config.accessLogs.existingBucket,
        provider: config.provider,
        tags: config.tags,
      });

      logsConfig = {
        bucket,
        enabled: true,
        prefix,
      };
    }

    const albConfig: AlbConfig = {
      namePrefix: config.alb6CharacterPrefix,
      securityGroups: [this.securityGroup.id],
      internal: config.internal !== undefined ? config.internal : false,
      subnets: config.subnetIds,
      tags: config.tags,
      accessLogs: logsConfig,
      provider: config.provider,
    };
    this.alb = new Alb(this, `alb`, albConfig);
  }

  /**
   *
   * @param config Creates a bucket according to https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html#attach-bucket-policy if one does not exist
   * @returns
   */
  private getOrCreateBucket(config: {
    existingBucket?: string;
    bucket?: string;
    tags?: { [key: string]: string };
    provider?: TerraformProvider;
  }): string {
    if (config.existingBucket === undefined && config.bucket === undefined) {
      throw new Error(
        'If you are configuring access logs you need to define either an existing bucket or a new one to store the logs'
      );
    }

    if (config.existingBucket !== undefined) {
      return new DataAwsS3Bucket(this, 'log-bucket', {
        bucket: config.existingBucket,
        provider: config.provider,
      }).bucket;
    }

    const s3Bucket = new S3Bucket(this, 'log-bucket', {
      bucket: config.bucket,
      provider: config.provider,
      tags: config.tags,
    });

    const albAccountId = new DataAwsElbServiceAccount(
      this,
      'elb-service-account',
      { provider: config.provider }
    ).id;

    const s3IAMDocument = new DataAwsIamPolicyDocument(
      this,
      'iam-log-bucket-policy-document',
      {
        statement: [
          {
            effect: 'Allow',
            principals: [
              {
                type: 'AWS',
                identifiers: [`arn:aws:iam::${albAccountId}:root`],
              },
            ],
            actions: ['s3:PutObject'],
            resources: [`arn:aws:s3:::${s3Bucket.bucket}/*`],
          },
        ],
        provider: config.provider,
      }
    );

    new S3BucketPolicy(this, 'log-bucket-policy', {
      bucket: s3Bucket.bucket,
      policy: s3IAMDocument.json,
      provider: config.provider,
    });

    return s3Bucket.bucket;
  }
}

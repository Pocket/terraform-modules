import { Resource, TerraformVariable, VariableType, Fn } from 'cdktf';
import { vpc, elb, datasources, s3, iam } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

const ALB_ACCOUNT_ID_MAP = {
  us_east_1: '127311923021',
  us_west_1: '027434742980',
  us_west_2: '797873946194',
};

export interface ApplicationLoadBalancerProps {
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
export class ApplicationLoadBalancer extends Resource {
  public readonly alb: elb.Alb;
  public readonly securityGroup: vpc.SecurityGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationLoadBalancerProps
  ) {
    super(scope, name);

    this.securityGroup = new vpc.SecurityGroup(this, `alb_security_group`, {
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
    });

    let logsConfig: elb.AlbAccessLogs = undefined;
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
      });

      logsConfig = {
        bucket,
        enabled: true,
        prefix,
      };
    }

    const albConfig: elb.AlbConfig = {
      namePrefix: config.alb6CharacterPrefix,
      securityGroups: [this.securityGroup.id],
      internal: config.internal !== undefined ? config.internal : false,
      subnets: config.subnetIds,
      tags: config.tags,
      accessLogs: logsConfig,
    };
    this.alb = new elb.Alb(this, `alb`, albConfig);
  }

  /**
   *
   * @param config Creates a bucket according to https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html#attach-bucket-policy if one does not exist
   * @returns
   */
  private getOrCreateBucket(config: {
    existingBucket?: string;
    bucket?: string;
  }): string {
    if (config.existingBucket === undefined && config.bucket === undefined) {
      throw new Error(
        'If you are configuring access logs you need to define either an existing bucket or a new one to store the logs'
      );
    }

    if (config.existingBucket !== undefined) {
      return new s3.DataAwsS3Bucket(this, 'log-bucket', {
        bucket: config.existingBucket,
      }).bucket;
    }

    const s3Bucket = new s3.S3Bucket(this, 'log-bucket', {
      bucket: config.bucket,
    });

    // Need to convert to a map so we can use the region name on demand
    const albAccountRegionMap = new TerraformVariable(this, 'region_map', {
      type: VariableType.MAP_STRING,
      default: ALB_ACCOUNT_ID_MAP,
    });

    // we need to replace from - to _ because in the map terraform would auto move
    const albAccountId = Fn.lookup(
      albAccountRegionMap.fqn,
      Fn.replace(new datasources.DataAwsRegion(this, 'region').name, '-', '_'),
      'us_east_1' //default if not found a value in the map
    );

    const s3IAMDocument = new iam.DataAwsIamPolicyDocument(
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
      }
    );

    new s3.S3BucketPolicy(this, 'log-bucket-policy', {
      bucket: s3Bucket.bucket,
      policy: s3IAMDocument.json,
    });

    return s3Bucket.bucket;
  }
}

import { Resource } from 'cdktf';
import { Synthetics, IAM, CloudWatch } from '@cdktf/provider-aws';
import { Construct } from 'constructs';
import { DataArchiveFile } from '@cdktf/provider-archive';

import compile from 'string-template/compile';
import fs = require('fs');
import path = require('path');

export interface PocketSyntheticProps {
  config?: {
    url: string;
    path: string;
    port: string;
    protocol: string;
  };
  check?: any;
  environment: string;
  artifactS3Location: string;
  pagerDutyArn?: string;
}

const defaultMonitor = compile(`
var synthetics = require('Synthetics');

const apiCanary = async function () {

    // Handle validation for positive scenario
    const validateSuccessful = async function (res) {
        return new Promise((resolve, reject) => {
            if (res.statusCode < 200 || res.statusCode > 299) {
                throw res.statusCode + ' ' + res.statusMessage;
            }

            let responseBody = '';
            res.on('data', (d) => {
                responseBody += d;
            });

            res.on('end', () => {
                // Add validation on 'responseBody' here if required.
                resolve();
            });
        });
    };

    let commonProps = {
        hostname: '{0}',
        method: 'GET',
        protocol: '{1}',
        port: '{2}',
        region: process.env.AWS_REGION,
        body:  "",
        headers: {
            "User-Agent": synthetics.getCanaryUserAgentString(),
        },
    }

    let allConfig = {
        includeRequestHeaders: true,
        includeResponseHeaders: true,
        includeRequestBody: true,
        includeResponseBody: false,
        restrictedHeaders: ["authorization", "x-amz-security-token"],
        continueOnHttpStepFailure: true
    };

    await synthetics.executeHttpStep('Verify synthetic check', {
        ...commonProps,
        path: '{3}',
    }, validateSuccessful, allConfig);
};

exports.handler = async () => {
    return await apiCanary();
};
`);

export class PocketSyntheticCheck extends Resource {
  constructor(
    scope: Construct,
    private name: string,
    private config: PocketSyntheticProps
  ) {
    super(scope, name);

    if (this.config.check == undefined) {
      this.config.check = defaultMonitor(
        this.config.config.url,
        this.config.config.protocol,
        this.config.config.port,
        this.config.config.path
      );
    }

    const indexPath = path.join(
      __dirname,
      'synthetics',
      'nodejs',
      'node_modules',
      'index.js'
    );

    fs.writeFileSync(indexPath, this.config.check);

    const zipFile = new DataArchiveFile(this, 'synthetic-zip-file', {
      type: 'zip',
      // TODO: hmm, maybe don't want to cause a diff evertyime
      outputPath: `index-${(+new Date()).toString(36)}.zip`,
      sourceDir: path.join(__dirname, 'synthetics'),
    });

    new Synthetics.SyntheticsCanary(this, `canary-${this.name}`, {
      name: `${this.name}-syntheic`.toLowerCase(),
      schedule: { expression: 'rate(3 minutes)' },
      runtimeVersion: 'syn-nodejs-puppeteer-3.3',
      artifactS3Location: this.config.artifactS3Location,
      zipFile: zipFile.outputPath,
      handler: 'index.handler',
      executionRoleArn: this.syntheticsExecutionRole(
        this.config.artifactS3Location
      ).arn,
      startCanary: true,
    });

    new CloudWatch.CloudwatchMetricAlarm(this, `synthetics-failed-alarm`, {
      alarmName: `${this.name}-SyntheticsFailed-Alarm`,
      namespace: 'CloudWatchSynthetics',
      metricName: 'Failures',
      dimensions: {
        CanaryName: `${this.name}-synthetic`.toLowerCase(),
      },
      period: 60,
      evaluationPeriods: 1,
      statistic: 'SampleCount',
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      threshold: 1,
      alarmDescription: 'Synthetic Check is failing',
      insufficientDataActions: [],
      alarmActions: [], //TODO: put a pagerduty arn here
      treatMissingData: 'notBreaching',
    });
  }

  private syntheticsExecutionRole(bucket: string) {
    const iamRole = new IAM.IamRole(this, 'synthetics-execution-role', {
      name: `synthetics-role-for-${this.name}`,
      assumeRolePolicy: this.syntheticsAssumePolicyDocument(),
    });

    const policy = new IAM.IamPolicy(this, 'execution-policy', {
      name: `${this.name}-ExecutionRolePolicy`,
      policy: this.getPolicyDocument(bucket.replace('s3://', '')),
    });

    new IAM.IamRolePolicyAttachment(this, 'execution-role-policy-attachment', {
      role: iamRole.name,
      policyArn: policy.arn,
      dependsOn: [iamRole, policy],
    });
    return iamRole;
  }

  private getPolicyDocument(bucket: string) {
    const document = {
      version: '2012-10-17',
      statement: [
        {
          effect: 'Allow',
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: ['arn:aws:logs:*:*:*'],
        },
        {
          effect: 'Allow',
          actions: [
            's3:ListAllMyBuckets',
            'cloudwatch:PutMetricData',
            'xray:PutTraceSegments',
          ],
          resources: ['*'],
        },
        {
          effect: 'Allow',
          actions: ['s3:PutObject', 's3:GetBucketLocation'],
          resources: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
        },
      ],
    };

    return new IAM.DataAwsIamPolicyDocument(
      this,
      'execution-policy-document',
      document
    ).json;
  }

  private syntheticsAssumePolicyDocument() {
    return new IAM.DataAwsIamPolicyDocument(this, 'assume-policy-document', {
      version: '2012-10-17',
      statement: [
        {
          effect: 'Allow',
          actions: ['sts:AssumeRole'],
          principals: [
            {
              identifiers: ['lambda.amazonaws.com', 'synthetics.amazonaws.com'],
              type: 'Service',
            },
          ],
        },
      ],
    }).json;
  }
}

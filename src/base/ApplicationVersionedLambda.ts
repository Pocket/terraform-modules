import { Fn, Resource } from 'cdktf';
import { Construct } from 'constructs';
import { cloudwatch, iam, lambdafunction, s3 } from '@cdktf/provider-aws';
import {
  DataArchiveFile,
  DataArchiveFileSource,
} from '@cdktf/provider-archive';

export enum LAMBDA_RUNTIMES {
  PYTHON38 = 'python3.8',
  NODEJS12 = 'nodejs12.x',
  NODEJS14 = 'nodejs14.x',
}

export interface ApplicationVersionedLambdaProps {
  name: string;
  description?: string;
  runtime: LAMBDA_RUNTIMES;
  handler: string;
  timeout?: number;
  environment?: { [key: string]: string };
  vpcConfig?: lambdafunction.LambdaFunctionVpcConfig;
  executionPolicyStatements?: iam.DataAwsIamPolicyDocumentStatement[];
  tags?: { [key: string]: string };
  logRetention?: number;
  s3Bucket: string;
  usesCodeDeploy?: boolean;
}

const DEFAULT_TIMEOUT = 5;
const DEFAULT_RETENTION = 14;

export class ApplicationVersionedLambda extends Resource {
  public readonly versionedLambda: lambdafunction.LambdaAlias;
  public lambdaExecutionRole: iam.IamRole;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationVersionedLambdaProps
  ) {
    super(scope, name);

    this.createCodeBucket();
    this.versionedLambda = this.createLambdaFunction();
  }

  private createLambdaFunction() {
    this.lambdaExecutionRole = new iam.IamRole(this, 'execution-role', {
      name: `${this.config.name}-ExecutionRole`,
      assumeRolePolicy: this.getLambdaAssumePolicyDocument(),
    });

    const executionPolicy = new iam.IamPolicy(this, 'execution-policy', {
      name: `${this.config.name}-ExecutionRolePolicy`,
      policy: this.getLambdaExecutionPolicyDocument(),
    });

    new iam.IamRolePolicyAttachment(this, 'execution-role-policy-attachment', {
      role: this.lambdaExecutionRole.name,
      policyArn: executionPolicy.arn,
      dependsOn: [this.lambdaExecutionRole, executionPolicy],
    });

    const defaultLambda = this.getDefaultLambda();
    const lambdaConfig: lambdafunction.LambdaFunctionConfig = {
      functionName: `${this.config.name}-Function`,
      filename: defaultLambda.outputPath,
      handler: this.config.handler,
      runtime: this.config.runtime,
      timeout: this.config.timeout ?? DEFAULT_TIMEOUT,
      sourceCodeHash: defaultLambda.outputBase64Sha256,
      role: this.lambdaExecutionRole.arn,
      vpcConfig: this.config.vpcConfig,
      publish: true,
      lifecycle: {
        ignoreChanges: [
          'filename',
          'source_code_hash',
          this.shouldIgnorePublish() ? 'publish' : '',
        ].filter((v: string) => v),
      },
      tags: this.config.tags,
      environment: this.config.environment
        ? { variables: this.config.environment }
        : undefined,
    };

    const lambda = new lambdafunction.LambdaFunction(
      this,
      'lambda',
      lambdaConfig
    );

    new cloudwatch.CloudwatchLogGroup(this, 'log-group', {
      name: `/aws/lambda/${lambda.functionName}`,
      retentionInDays: this.config.logRetention ?? DEFAULT_RETENTION,
      dependsOn: [lambda],
    });

    return new lambdafunction.LambdaAlias(this, 'alias', {
      functionName: lambda.functionName,
      functionVersion: Fn.element(Fn.split(':', lambda.qualifiedArn), 7),
      name: 'DEPLOYED',
      lifecycle: {
        ignoreChanges: ['function_version'],
      },
      dependsOn: [lambda],
    });
  }

  private shouldIgnorePublish() {
    if (this.config.usesCodeDeploy !== undefined) {
      return this.config.usesCodeDeploy;
    }

    return false;
  }

  private getLambdaAssumePolicyDocument() {
    return new iam.DataAwsIamPolicyDocument(this, 'assume-policy-document', {
      version: '2012-10-17',
      statement: [
        {
          effect: 'Allow',
          actions: ['sts:AssumeRole'],
          principals: [
            {
              identifiers: ['lambda.amazonaws.com', 'edgelambda.amazonaws.com'],
              type: 'Service',
            },
          ],
        },
      ],
    }).json;
  }

  private getLambdaExecutionPolicyDocument() {
    const document = {
      version: '2012-10-17',
      statement: [
        {
          effect: 'Allow',
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
          ],
          resources: ['arn:aws:logs:*:*:*'],
        },
        ...(this.config.executionPolicyStatements ?? []),
      ],
    };

    if (this.config.vpcConfig) {
      document.statement.push({
        effect: 'Allow',
        actions: [
          'ec2:DescribeNetworkInterfaces',
          'ec2:CreateNetworkInterface',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeInstances',
          'ec2:AttachNetworkInterface',
        ],
        resources: ['*'],
      });
    }

    return new iam.DataAwsIamPolicyDocument(
      this,
      'execution-policy-document',
      document
    ).json;
  }

  private getDefaultLambda() {
    const source = this.getDefaultLambdaSource();
    return new DataArchiveFile(this, 'lambda-default-file', {
      type: 'zip',
      source: [source],
      outputPath: `${source.filename}.zip`,
    });
  }

  private getDefaultLambdaSource(): DataArchiveFileSource {
    const runtime = this.config.runtime.match(/[a-z]*/)[0];
    const handler = this.config.handler.split('.');
    const functionName = handler.pop();
    const functionFilename = handler.join('.');

    let content = `exports.${functionName} = (event, context) => { console.log(event) }`;
    let filename = `${functionFilename}.js`;

    if (runtime === 'python') {
      content = `import json\ndef ${functionName}(event, context):\n\t print(event)\n\t return {'statusCode': 200, 'headers': {'dance': 'party'}, 'body': json.dumps({'electric': 'boogaloo'}), 'isBase64Encoded': False}`;
      filename = `${functionFilename}.py`;
    }

    return {
      content,
      filename,
    };
  }

  private createCodeBucket() {
    const codeBucket = new s3.S3Bucket(this, 'code-bucket', {
      bucket: this.config.s3Bucket,
      acl: 'private',
      tags: this.config.tags,
      forceDestroy: true,
    });

    new s3.S3BucketPublicAccessBlock(this, `code-bucket-public-access-block`, {
      bucket: codeBucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
    });
  }
}

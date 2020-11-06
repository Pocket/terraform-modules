import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  CloudwatchLogGroup,
  DataAwsIamPolicyDocument,
  DataAwsIamPolicyDocumentStatement,
  IamRole,
  IamRolePolicy,
  LambdaAlias,
  LambdaFunction,
  LambdaFunctionVpcConfig,
  S3Bucket,
  S3BucketPublicAccessBlock,
} from '../../.gen/providers/aws';
import {
  DataArchiveFile,
  DataArchiveFileSource,
} from '../../.gen/providers/archive';

interface ApplicationLambdaProps {
  name: string;
  description?: string;
  runtime: string;
  timeout?: number;
  environment?: { [key: string]: string };
  vpcConfig?: LambdaFunctionVpcConfig;
  executionPolicyStatements?: DataAwsIamPolicyDocumentStatement[];
  tags?: { [key: string]: string };
  logRetention?: number;
  s3Bucket?: string;
}

const DEFAULT_TIMEOUT = 5;
const DEFAULT_RETENTION = 14;

export class ApplicationVersionedLambda extends Resource {
  public readonly versionedLambda: LambdaAlias;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationLambdaProps
  ) {
    super(scope, name);

    this.createCodeBucket();
    this.versionedLambda = this.createLambdaFunction();
  }

  private createLambdaFunction() {
    const executionRole = new IamRole(this, 'execution-role', {
      name: `${this.config.name}-ExecutionRole`,
      assumeRolePolicy: this.getLambdaAssumePolicyDocument(),
    });

    new IamRolePolicy(this, 'execution-role-policy', {
      name: `${this.config.name}-ExecutionRolePolicy`,
      policy: this.getLambdaExecutionPolicyDocument(),
      role: executionRole.name,
      dependsOn: [executionRole],
    });

    const defaultLambda = this.getDefaultLambda();

    const lambda = new LambdaFunction(this, 'lambda', {
      functionName: this.config.name,
      filename: defaultLambda.outputPath,
      handler: 'index.handler',
      runtime: this.config.runtime,
      timeout: this.config.timeout ?? DEFAULT_TIMEOUT,
      sourceCodeHash: defaultLambda.outputBase64Sha256,
      role: executionRole.arn,
      vpcConfig: [this.config.vpcConfig],
      publish: true,
      lifecycle: {
        ignoreChanges: ['filename', 'source_code_hash'],
      },
      environment: [
        {
          variables: this.config.environment,
        },
      ],
      tags: this.config.tags,
    });

    new CloudwatchLogGroup(this, 'log-group', {
      name: `/aws/lambda/${lambda.functionName}`,
      retentionInDays: this.config.logRetention ?? DEFAULT_RETENTION,
      dependsOn: [lambda],
    });

    const lambdaAlias = new LambdaAlias(this, 'alias', {
      functionName: lambda.functionName,
      functionVersion: lambda.version,
      name: 'DEPLOYED',
      lifecycle: {
        ignoreChanges: ['function_version'],
      },
      dependsOn: [lambda],
    });

    lambdaAlias.addOverride(
      'function_version',
      `split(":", ${lambda.qualifiedArn})[7]`
    );

    return lambdaAlias;
  }

  private getLambdaAssumePolicyDocument() {
    return new DataAwsIamPolicyDocument(this, 'assume-policy-document', {
      version: '2012-10-17',
      statement: [
        {
          effect: 'Allow',
          actions: ['sts:AssumeRole'],
          principals: [
            {
              identifiers: ['lambda.amazonaws.com'],
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

    return new DataAwsIamPolicyDocument(
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

    let content =
      'export const handler = (event, context) => { console.log(event) }';
    let filename = 'index.js';

    if (runtime === 'python') {
      content = 'handler(event, context):\n\tprint(event)';
      filename = 'index.py';
    }

    return {
      content,
      filename,
    };
  }

  private createCodeBucket() {
    const codeBucket = new S3Bucket(this, 'code-bucket', {
      bucket:
        this.config.s3Bucket ?? `pocket-${this.config.name.toLowerCase()}`,
      acl: 'private',
      tags: this.config.tags,
    });

    new S3BucketPublicAccessBlock(this, `code-bucket-public-access-block`, {
      bucket: codeBucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
    });
  }
}

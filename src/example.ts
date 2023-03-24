import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws/lib/provider';
import { PocketALBApplication } from './pocket/PocketALBApplication';
import { ApplicationECSContainerDefinitionProps } from './base/ApplicationECSContainerDefinition';
import { LocalProvider } from '@cdktf/provider-local/lib/provider';
import { NullProvider } from '@cdktf/provider-null/lib/provider';
import { TimeProvider } from '@cdktf/provider-time/lib/provider';
import { Wafv2WebAcl } from '@cdktf/provider-aws/lib/wafv2-web-acl';

class Example extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', {
      region: 'us-east-1',
    });

    new LocalProvider(this, 'local', {});
    new NullProvider(this, 'null', {});
    new TimeProvider(this, 'timeProvider', {});

    const containerConfigBlue: ApplicationECSContainerDefinitionProps = {
      name: 'blueContainer',
      containerImage: 'n0coast/node-example',
      repositoryCredentialsParam:
        'arn:aws:secretsmanager:us-east-1:410318598490:secret:Shared/DockerHub-79jJxy',
      portMappings: [
        {
          hostPort: 3000,
          containerPort: 3000,
        },
      ],
      envVars: [
        {
          name: 'foo',
          value: 'bar',
        },
      ],
      mountPoints: [
        {
          containerPath: '/qdrant/storage',
          sourceVolume: 'data',
        },
      ],
      logMultilinePattern: '^\\S.+',
      logDatetimeFormat: '[%b %d, %Y %H:%M:%S]',
      ulimits: [
        {
          hardLimit: 65535,
          name: 'nofile',
          softLimit: 65535,
        },
      ],
    };

    const wafAcl = new Wafv2WebAcl(this, 'example_waf_acl', {
      description: 'Example Pocket Waf ACL',
      name: 'pocket-example-waf',
      scope: 'REGIONAL',
      defaultAction: {
        allow: {},
      },
      visibilityConfig: {
        cloudwatchMetricsEnabled: true,
        metricName: 'pocket-example-waf-default-rule',
        sampledRequestsEnabled: true,
      },
      rule: [
        {
          name: 'ExampleRateBasedPolicy',
          priority: 1,
          action: {
            block: {},
          },
          statement: {
            rateBasedStatement: {
              limit: 10000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudwatchMetricsEnabled: true,
            metricName: 'pocket-example-waf-rate-limit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new PocketALBApplication(this, 'example', {
      exposedContainer: {
        name: 'blueContainer',
        port: 3000,
        healthCheckPath: '/',
      },
      codeDeploy: {
        useCodeDeploy: true,
      },
      accessLogs: {
        bucket: 'pocket-dev-blah',
      },
      cdn: false, // maybe make this false if you're testing an actual terraform apply - cdn's take a loooong time to spin up
      alb6CharacterPrefix: 'ACMECO',
      internal: false,
      domain: 'acme.getpocket.dev',
      prefix: 'ACME-Dev', // Prefix is a combo of the `Name-Environment`
      containerConfigs: [containerConfigBlue],
      ecsIamConfig: {
        prefix: 'ACME-Dev',
        taskExecutionRolePolicyStatements: [
          {
            effect: 'Allow',
            actions: [
              'secretsmanager:GetResourcePolicy',
              'secretsmanager:GetSecretValue',
              'secretsmanager:DescribeSecret',
              'secretsmanager:ListSecretVersionIds',
            ],
            resources: [
              'arn:aws:secretsmanager:us-east-1:410318598490:secret:Shared/DockerHub-79jJxy',
            ],
          },
        ],
        taskRolePolicyStatements: [],
        taskExecutionDefaultAttachmentArn:
          'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
      },
      efsConfig: {
        creationToken: 'ACME-Dev',
        volumeName: 'data',
      },
      wafConfig: {
        acl: wafAcl,
      },
    });
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();

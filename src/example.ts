import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws';
import { PocketALBApplication } from './pocket/PocketALBApplication';
import { ApplicationECSContainerDefinitionProps } from './base/ApplicationECSContainerDefinition';
import { LocalProvider } from '@cdktf/provider-local';
import { NullProvider } from '@cdktf/provider-null';
import { TimeProvider } from '@cdktf/provider-time';

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
          containerPath: "/qdrant/storage",
          sourceVolume: "data",
        },
      ],
    };

    new PocketALBApplication(this, 'example', {
      exposedContainer: {
        name: 'blueContainer',
        port: 3000,
        healthCheckPath: '/',
      },
      codeDeploy: {
        useCodeDeploy: true,
      },
      cdn: false, // maybe make this false if you're testing an actual terraform apply - cdn's take a loooong time to spin up
      alb6CharacterPrefix: 'ACMECO',
      internal: false,
      domain: 'acme.getpocket.dev',
      prefix: 'ACME-Dev', // Prefix is a combo of the `Name-Environment`
      containerConfigs: [containerConfigBlue],
      ecsIamConfig: {
        prefix: 'ACME-Dev',
        taskExecutionRolePolicyStatements: [],
        taskRolePolicyStatements: [],
      taskExecutionDefaultAttachmentArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
      },
      efsConfig: {
        creationToken: 'ACME-Dev',
        volumeName: 'data',
      },
    });
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();

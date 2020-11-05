import { Construct } from 'constructs';
import { App, RemoteBackend, TerraformStack } from 'cdktf';
import { AwsProvider } from '../.gen/providers/aws';
import { PocketALBApplication } from './pocket/PocketALBApplication';
import { ApplicationECSContainerDefinitionProps } from './base/ApplicationECSContainerDefinition';

class Example extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', {
      region: 'us-east-1',
    });

    // for local testing, comment out this RemoteBackend block
    new RemoteBackend(this, {
      hostname: 'app.terraform.io',
      organization: 'Acme',
      workspaces: [
        {
          prefix: `Example-`,
        },
      ],
    });

    const containerConfigBlue: ApplicationECSContainerDefinitionProps = {
      name: 'blueContainer',
      containerImage: 'fake',
      logGroup: 'no',
      hostPort: 3002,
      containerPort: 3002,
      envVars: [
        {
          name: 'foo',
          value: 'bar',
        },
      ],
      secretEnvVars: [
        {
          name: 'somesecret',
          valueFrom: 'someArn',
        },
      ],
      repositoryCredentialsParam: '',
    };

    new PocketALBApplication(this, 'example', {
      exposedContainer: {
        name: 'blueContainer',
        port: 3002,
        healthCheckPath: '/',
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
        taskExecutionDefaultAttachmentArn: '',
      },
    });
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();

import { Construct } from 'constructs';
import { App, RemoteBackend, TerraformStack } from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws';
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
      containerImage: 'bitnami/node-example:0.0.1',
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
      },
    });
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();

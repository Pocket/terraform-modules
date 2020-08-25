import { Construct } from 'constructs';
import { App, RemoteBackend, TerraformStack } from 'cdktf';
import { AwsProvider } from '../.gen/providers/aws';
import { PocketALBApplication } from './pocket/PocketALBApplication';

class Example extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', {
      region: 'us-east-1',
    });

    new RemoteBackend(this, {
      hostname: 'app.terraform.io',
      organization: 'Acme',
      workspaces: [
        {
          prefix: `Example-`,
        },
      ],
    });

    new PocketALBApplication(this, 'example', {
      cdn: true,
      alb6CharacterPrefix: 'CORP',
      internal: false,
      domain: 'test.acme.com',
      prefix: 'Example-',
    });
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();

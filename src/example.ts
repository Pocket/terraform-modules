import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws';
import { LocalProvider } from '@cdktf/provider-local';
import { NullProvider } from '@cdktf/provider-null';
import {
  PocketApiGateway,
  PocketApiGatewayProps,
} from './pocket/PocketApiGatewayLambdaIntegration';
import { LAMBDA_RUNTIMES } from './base/ApplicationVersionedLambda';
import { ArchiveProvider } from '@cdktf/provider-archive';

class Example extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', {
      region: 'us-east-1',
    });
    new LocalProvider(this, 'local', {});
    new NullProvider(this, 'null', {});
    new ArchiveProvider(this, 'archive', {});

    const config: PocketApiGatewayProps = {
      name: 'test-api-lambda',
      stage: 'test',
      domain: 'exampleapi.getpocket.dev',
      routes: [
        {
          path: 'endpoint',
          method: 'POST',
          eventHandler: {
            name: 'lambda-endpoint',
            lambda: {
              runtime: LAMBDA_RUNTIMES.PYTHON38,
              handler: 'index.handler',
            },
          },
        },
      ],
    };

    new PocketApiGateway(this, 'example', config);
  }
}

const app = new App();
new Example(app, 'apig-test');
app.synth();

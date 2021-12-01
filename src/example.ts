import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws';
import { LocalProvider } from '@cdktf/provider-local';
import { NullProvider } from '@cdktf/provider-null';
import {
  ApiGatewayLambdaRoute,
  PocketApiGateway,
  PocketApiGatewayProps
} from './pocket/PocketApiGatewayLambdaIntegration';
import { LAMBDA_RUNTIMES } from './base/ApplicationVersionedLambda';
import { PocketVPC } from './pocket/PocketVPC';
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
    const vpc = new PocketVPC(this, 'pocket-vpc');
    const prefix=`apigateway-dev`
    const fxaEventsRoute: ApiGatewayLambdaRoute = {
      path: 'events',
      method: 'POST',
      eventHandler: {
        name: `${prefix}-ApiGateway-FxA-Events`,
        lambda: {
          runtime: LAMBDA_RUNTIMES.NODEJS14,
          handler: 'index.handler',
          timeout: 120,
          vpcConfig: {
            securityGroupIds: vpc.defaultSecurityGroups.ids,
            subnetIds: vpc.privateSubnetIds,
          },
          codeDeploy: {
            region: vpc.region,
            accountId: vpc.accountId,
          },
        },
      },
    };
    const pocketApiGatewayProps: PocketApiGatewayProps = {
      name: `${prefix}-API-Gateway`,
      stage: `dev`,
      routes: [fxaEventsRoute],
      domain:  'apig-test.getpocket.dev',
    };

    new PocketApiGateway(
      this,
      'fxa-events-apigateway-lambda',
      pocketApiGatewayProps
    );
  }
}

const app = new App();
new Example(app, 'apig-test');
app.synth();

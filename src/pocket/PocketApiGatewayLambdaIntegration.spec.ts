import { TerraformStack, Testing } from 'cdktf';
import { LAMBDA_RUNTIMES } from '../base/ApplicationVersionedLambda';
import {
  PocketApiGateway,
  PocketApiGatewayProps,
} from './PocketApiGatewayLambdaIntegration';

const config: PocketApiGatewayProps = {
  name: 'test-api-lambda',
  region: 'us-east-1',
  accountId: 'abc123',
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

test('renders an api gateway with a lambda integration', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketApiGateway(stack, 'test-api-lambda', {
      ...config,
    });
  });
  expect(synthed).toMatchSnapshot();
});

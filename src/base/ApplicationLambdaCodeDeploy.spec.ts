import { Testing, TerraformStack } from 'cdktf';
import {
  ApplicationLambdaCodeDeploy,
  ApplicationVersionedLambdaCodeDeployProps,
} from './ApplicationLambdaCodeDeploy';

const config: ApplicationVersionedLambdaCodeDeployProps = {
  name: 'Test-Lambda-Code-Deploy',
  region: 'us-east-1',
  accountId: '123',
};

test('renders a lambda code deploy app', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda code deploy app with sns topic arn', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', {
    ...config,
    deploySnsTopicArn: 'test:deploy-topic:arn',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda code deploy app with sns topic arn and detail type', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', {
    ...config,
    deploySnsTopicArn: 'test:deploy-topic:arn',
    detailType: 'FULL',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

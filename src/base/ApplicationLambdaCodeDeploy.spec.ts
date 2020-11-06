import { Testing, TerraformStack } from 'cdktf';
import { ApplicationLambdaCodeDeploy } from './ApplicationLambdaCodeDeploy';

const config = {
  name: 'Test-Lambda-Code-Deploy',
  deploySnsTopicName: 'Test-Deployment-Topic',
};

test('renders a lambda code deploy app', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda code deploy app with detail type', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', {
    ...config,
    detailType: 'FULL',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

import { Testing } from 'cdktf';
import {
  ApplicationLambdaCodeDeploy,
  ApplicationVersionedLambdaCodeDeployProps,
} from './ApplicationLambdaCodeDeploy';

const config: ApplicationVersionedLambdaCodeDeployProps = {
  name: 'Test-Lambda-Code-Deploy',
  region: 'us-east-1',
  accountId: '123',
};

describe('ApplicationLambdaCodeDeploy', () => {
  it('renders a lambda code deploy app', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', config);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders a lambda code deploy app with sns topic arn', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', {
        ...config,
        deploySnsTopicArn: 'test:deploy-topic:arn',
      });
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders a lambda code deploy app with sns topic arn and detail type', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationLambdaCodeDeploy(stack, 'test-lambda-code-deploy', {
        ...config,
        deploySnsTopicArn: 'test:deploy-topic:arn',
        detailType: 'FULL',
      });
    });
    expect(synthed).toMatchSnapshot();
  });
});

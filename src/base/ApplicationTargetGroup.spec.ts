import { Testing, TerraformStack } from 'cdktf';
import { ApplicationTargetGroup } from './ApplicationTargetGroup';

test('renders a Target Group without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationTargetGroup(stack, 'testTargetGroup', {
    shortName: 'ABC',
    vpcId: '123',
    healthCheckPath: '/',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Target Group with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationTargetGroup(stack, 'testTargetGroup', {
    shortName: 'A1BC',
    vpcId: '123',
    healthCheckPath: '/',
    tags: {
      name: 'thedude',
      hobby: 'bowling',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

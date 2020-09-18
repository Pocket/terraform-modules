import { Testing, TerraformStack } from 'cdktf';
import { ApplicationLoadBalancer } from './ApplicationLoadBalancer';

test('renders an ALB without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLoadBalancer(stack, 'testALB', {
    prefix: 'test-',
    alb6CharacterPrefix: 'TEST',
    vpcId: '123',
    subnetIds: ['a', 'b'],
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an ALB with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLoadBalancer(stack, 'testALB', {
    prefix: 'test-',
    alb6CharacterPrefix: 'TEST',
    vpcId: '123',
    subnetIds: ['a', 'b'],
    tags: {
      name: 'thedude',
      hobby: 'bowling',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

import { Testing, TerraformStack } from 'cdktf';
import { ApplicationLoadBalancerTargetGroup } from './ApplicationLoadBalancerTargetGroup';

test('renders target group without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationLoadBalancerTargetGroup(stack, 'testTargetGroup', {
    interval: 5,
    path: '/',
    protocol: 'HTTP',
    protocolHealthCheck: 'HTTP',
    healthyThreshold: 2,
    unhealthyThreshold: 3,
    timeout: 5,
    vpcId: '123',
    port: 81,
    name: 'test',
    targetType: 'ip',
    deregistrationDelay: 5,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

// test('renders an ALB Target with tags', () => {
//   const app = Testing.app();
//   const stack = new TerraformStack(app, 'test');
//
//   new ApplicationLoadBalancer(stack, 'testALB', {
//     prefix: 'test-',
//     alb6CharacterPrefix: 'TEST',
//     vpcId: '123',
//     subnetIds: ['a', 'b'],
//     tags: {
//       name: 'thedude',
//       hobby: 'bowling',
//     },
//   });

// expect(Testing.synth(stack)).toMatchSnapshot();
// });

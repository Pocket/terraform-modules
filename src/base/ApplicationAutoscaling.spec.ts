import { Testing, TerraformStack } from 'cdktf';
import { ApplicationAutoscaling } from './ApplicationAutoscaling';

test('renders autoscaling without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationAutoscaling(stack, 'testAutoscaling', {
    prefix: 'test-',
    targetMinCapacity: 1,
    targetMaxCapacity: 5,
    ecsClusterName: 'ecs-cluster-test',
    ecsServiceName: 'ecs-service-test',
    scalableDimension: 'ecs:service:DesiredCount',
    stepScaleOutAdjustment: 2,
    stepScaleInAdjustment: 1,
    scaleInThreshold: 30,
    scaleOutThreshold: 45,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

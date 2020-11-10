import { Testing, TerraformStack } from 'cdktf';
import { ApplicationAutoscaling } from './ApplicationAutoscaling';

test('renders autoscaling without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'testAutoscaling');

  new ApplicationAutoscaling(stack, 'testAutoscaling', {
    prefix: 'test-',
    targetMinCapacity: 1,
    targetMaxCapacity: 2,
    ecsClusterName: 'ecs-cluster-test',
    ecsServiceName: 'ecs-service-test',
    scalableDimension: 'ecs:service:DesiredCount',
    stepScaleOutAdjustment: 20,
    stepScaleInAdjustment: 10,
    scaleInThreshold: 1,
    scaleOutThreshold: 2,
  });
  expect(Testing.synth(stack)).toMatchSnapshot();
});

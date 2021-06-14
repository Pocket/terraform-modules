import { Testing, TerraformStack } from 'cdktf';
import { TestResource } from '../testHelpers';
import {
  ApplicationAutoscaling,
  ApplicationAutoscalingProps,
} from './ApplicationAutoscaling';

describe('ApplicationAutoscaling', () => {
  let app;
  let stack;

  const props: ApplicationAutoscalingProps = {
    prefix: 'test-',
    targetMinCapacity: 1,
    targetMaxCapacity: 5,
    ecsClusterName: 'ecs-cluster-test',
    ecsServiceName: 'ecs-service-test',
    scalableDimension: 'ecs:service:DesiredCount',
    stepScaleOutAdjustment: 2,
    stepScaleInAdjustment: -1,
    scaleInThreshold: 30,
    scaleOutThreshold: 45,
  };

  beforeEach(() => {
    app = Testing.app();
    stack = new TerraformStack(app, 'test');
  });

  describe('generateIamRole', () => {
    it('renders an IamRole', () => {
      const construct = new TestResource(stack, 'test-resource');

      ApplicationAutoscaling.generateIamRole(construct, props);

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateIamRolePolicy', () => {
    it('renders an IamRolePolicy', () => {
      const construct = new TestResource(stack, 'test-resource');

      const role = ApplicationAutoscaling.generateIamRole(construct, props);
      ApplicationAutoscaling.generateIamRolePolicy(construct, props, role);

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateAutoScalingTarget', () => {
    it('renders an AutoscalingTarget', () => {
      const construct = new TestResource(stack, 'test-resource');

      const role = ApplicationAutoscaling.generateIamRole(construct, props);
      ApplicationAutoscaling.generateAutoScalingTarget(construct, props, role);

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateAutoScalingPolicy', () => {
    it('renders a scale-in AutoscalingPolicy', () => {
      const construct = new TestResource(stack, 'test-resource');

      const role = ApplicationAutoscaling.generateIamRole(construct, props);
      const target = ApplicationAutoscaling.generateAutoScalingTarget(
        construct,
        props,
        role
      );
      ApplicationAutoscaling.generateAutoSclaingPolicy(
        construct,
        props,
        target,
        'In'
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });

    it('renders a scale-out AutoscalingPolicy', () => {
      const construct = new TestResource(stack, 'test-resource');

      const role = ApplicationAutoscaling.generateIamRole(construct, props);
      const target = ApplicationAutoscaling.generateAutoScalingTarget(
        construct,
        props,
        role
      );
      ApplicationAutoscaling.generateAutoSclaingPolicy(
        construct,
        props,
        target,
        'Out'
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateCloudwatchMetricAlarm', () => {
    it('renders a scale-in Cloudwatch Alarm', () => {
      const construct = new TestResource(stack, 'test-resource');

      const role = ApplicationAutoscaling.generateIamRole(construct, props);
      const target = ApplicationAutoscaling.generateAutoScalingTarget(
        construct,
        props,
        role
      );

      const policy = ApplicationAutoscaling.generateAutoSclaingPolicy(
        construct,
        props,
        target,
        'In'
      );

      ApplicationAutoscaling.generateCloudwatchMetricAlarm(
        construct,
        props,
        'scale_in_alarm',
        `${props.prefix} Service Low CPU`,
        'Alarm to reduce capacity if container CPU is low',
        'LessThanThreshold',
        props.scaleInThreshold,
        policy.arn
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });

    it('renders a scale-out Cloudwatch Alarm', () => {
      const construct = new TestResource(stack, 'test-resource');

      const role = ApplicationAutoscaling.generateIamRole(construct, props);
      const target = ApplicationAutoscaling.generateAutoScalingTarget(
        construct,
        props,
        role
      );

      const policy = ApplicationAutoscaling.generateAutoSclaingPolicy(
        construct,
        props,
        target,
        'Out'
      );

      ApplicationAutoscaling.generateCloudwatchMetricAlarm(
        construct,
        props,
        'scale_out_alarm',
        `${props.prefix} Service High CPU`,
        'Alarm to add capacity if container CPU is high',
        'GreaterThanThreshold',
        props.scaleOutThreshold,
        policy.arn
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('constructor', () => {
    it('renders autoscaling without tags', () => {
      new ApplicationAutoscaling(stack, 'testAutoscaling', props);

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });
});

import { TerraformStack, Testing } from 'cdktf';
import { ApplicationECSAlbCodeDeploy } from './ApplicationECSAlbCodeDeploy';

test('renders a CodeDeploy without a sns', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECSAlbCodeDeploy(stack, 'testCodeDeploy', {
    prefix: 'Test-Dev',
    clusterName: 'cluster',
    serviceName: 'theService',
    listenerArn: 'listen-to-me',
    targetGroupNames: ['target-1', 'target-2'],
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a CodeDeploy with a sns', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECSAlbCodeDeploy(stack, 'testCodeDeploy', {
    prefix: 'Test-Dev',
    clusterName: 'cluster',
    serviceName: 'theService',
    listenerArn: 'listen-to-me',
    snsNotificationTopicArn: 'notify-me',
    targetGroupNames: ['target-1', 'target-2'],
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a CodeDeploy with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECSAlbCodeDeploy(stack, 'testCodeDeploy', {
    prefix: 'Test-Dev',
    clusterName: 'cluster',
    serviceName: 'theService',
    listenerArn: 'listen-to-me',
    snsNotificationTopicArn: 'notify-me',
    targetGroupNames: ['target-1', 'target-2'],
    tags: {
      test: '1234',
      tag: 'me',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

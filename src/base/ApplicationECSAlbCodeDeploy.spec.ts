import { Testing } from 'cdktf';
import { ApplicationECSAlbCodeDeploy } from './ApplicationECSAlbCodeDeploy';

describe('ApplicationECSAlbCodeDeploy', () => {
  it('renders a CodeDeploy without a sns', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationECSAlbCodeDeploy(stack, 'testCodeDeploy', {
        prefix: 'Test-Dev',
        clusterName: 'cluster',
        serviceName: 'theService',
        listenerArn: 'listen-to-me',
        targetGroupNames: ['target-1', 'target-2'],
      });
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders a CodeDeploy with a sns', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationECSAlbCodeDeploy(stack, 'testCodeDeploy', {
        prefix: 'Test-Dev',
        clusterName: 'cluster',
        serviceName: 'theService',
        listenerArn: 'listen-to-me',
        snsNotificationTopicArn: 'notify-me',
        targetGroupNames: ['target-1', 'target-2'],
      });
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders a CodeDeploy with tags', () => {
    const synthed = Testing.synthScope((stack) => {
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
    });
    expect(synthed).toMatchSnapshot();
  });
});

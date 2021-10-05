import { Testing } from 'cdktf';
import { ApplicationLoadBalancer } from './ApplicationLoadBalancer';

describe('ApplicationLoadBalancer', () => {
  it('renders an ALB without tags', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationLoadBalancer(stack, 'testALB', {
        prefix: 'test-',
        alb6CharacterPrefix: 'TEST',
        vpcId: '123',
        subnetIds: ['a', 'b'],
      });
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an ALB with tags', () => {
    const synthed = Testing.synthScope((stack) => {
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
    });
    expect(synthed).toMatchSnapshot();
  });
});

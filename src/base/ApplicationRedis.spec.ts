import { TerraformStack, Testing } from 'cdktf';
import { ApplicationElasticacheClusterProps } from './ApplicationElasticacheCluster';

import { ApplicationRedis } from './ApplicationRedis';

const BASE_CONFIG: ApplicationElasticacheClusterProps = {
  allowedIngressSecurityGroupIds: [],
  subnetIds: ['1234-123'],
  vpcId: 'cool-vpc',
  prefix: `abides-dev`,
};

test('renders redis with minimal config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationRedis(stack, 'testRedis', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders redis with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  const config: ApplicationElasticacheClusterProps = {
    ...BASE_CONFIG,
    tags: {
      letsgo: 'bowling',
      donnie: 'throwinrockstonight',
    },
  };
  new ApplicationRedis(stack, 'testRedis', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders redis with node change', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  const config: ApplicationElasticacheClusterProps = {
    ...BASE_CONFIG,
    node: {
      size: 'cache.m4.2xlarge',
      count: 5,
    },
  };
  new ApplicationRedis(stack, 'testRedis', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

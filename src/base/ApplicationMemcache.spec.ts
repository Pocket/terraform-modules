import { TerraformStack, Testing } from 'cdktf';
import { ApplicationElasticacheClusterProps } from './ApplicationElasticacheCluster';

import { ApplicationMemcache } from './ApplicationMemcache';

const BASE_CONFIG: ApplicationElasticacheClusterProps = {
  allowedIngressSecurityGroupIds: [],
  subnetIds: ['1234-123'],
  vpcId: 'cool-vpc',
  prefix: `abides-dev`,
};

test('renders memcached with minimal config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationMemcache(stack, 'testMemcached', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders memcached with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  const config: ApplicationElasticacheClusterProps = {
    ...BASE_CONFIG,
    tags: {
      letsgo: 'bowling',
      donnie: 'throwinrockstonight',
    },
  };
  new ApplicationMemcache(stack, 'testMemcached', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders memcached with node change', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  const config: ApplicationElasticacheClusterProps = {
    ...BASE_CONFIG,
    node: {
      size: 'cache.m4.2xlarge',
      count: 5,
    },
  };
  new ApplicationMemcache(stack, 'testMemcached', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

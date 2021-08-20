import { TerraformStack, Testing } from 'cdktf';
import { ApplicationRDSCluster } from './ApplicationRDSCluster';

test('renders a RDS cluster', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationRDSCluster(stack, 'testRDSCluster', {
    prefix: 'bowling-',
    vpcId: 'rug',
    subnetIds: ['0', '1'],
    rdsConfig: {
      masterUsername: 'walter',
      masterPassword: 'bowling',
      databaseName: 'walter',
    },
    tags: {
      whodis: 'walter',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders RDS without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationRDSCluster(stack, 'testRDSClusterNoTags', {
    prefix: 'bowling-',
    vpcId: 'rug',
    subnetIds: ['0', '1'],
    rdsConfig: {
      masterUsername: 'walter',
      masterPassword: 'bowling',
      databaseName: 'walter',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders RDS for mysql', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationRDSCluster(stack, 'testRDSMysql', {
    prefix: 'bowling-',
    vpcId: 'rug',
    subnetIds: ['0', '1'],
    rdsConfig: {
      masterUsername: 'walter',
      masterPassword: 'bowling',
      databaseName: 'walter',
      engine: 'aurora-mysql',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

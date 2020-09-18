import { Testing, TerraformStack } from 'cdktf';
import {
  ApplicationDynamoDBTable,
  ApplicationDynamoDBProps,
} from './ApplicationDynamoDBTable';

const BASE_CONFIG: ApplicationDynamoDBProps = {
  prefix: 'abides-',
  tableConfig: {
    hashKey: '123',
    attribute: [
      {
        name: 'attribeautiful',
        type: 'shrugs!',
      },
    ],
  },
};

test('renders dynamo db table with minimal config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders dynamo db table with read capacity', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  BASE_CONFIG.readCapacity = {
    tracking: 1,
    max: 10,
    min: 3,
  };

  new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders dynamo db table with write capacity', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  BASE_CONFIG.writeCapacity = {
    tracking: 1,
    max: 10,
    min: 3,
  };

  new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders dynamo db table with read and write capacity', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  BASE_CONFIG.writeCapacity = {
    tracking: 1,
    max: 10,
    min: 3,
  };

  BASE_CONFIG.readCapacity = {
    tracking: 1,
    max: 10,
    min: 3,
  };

  new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders dynamo db table with read and write capacity and tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  BASE_CONFIG.writeCapacity = {
    tracking: 1,
    max: 10,
    min: 3,
  };

  BASE_CONFIG.readCapacity = {
    tracking: 1,
    max: 10,
    min: 3,
  };

  BASE_CONFIG.tags = {
    name: 'thedude',
    hobby: 'bowling',
  };

  new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

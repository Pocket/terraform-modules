import { dynamodb } from '@cdktf/provider-aws';
import { Testing } from 'cdktf';
import {
  ApplicationDynamoDBTable,
  ApplicationDynamoDBProps,
  ApplicationDynamoDBTableCapacityMode,
} from './ApplicationDynamoDBTable';

describe('ApplicationDynamoDBTable', () => {
  let BASE_CONFIG: ApplicationDynamoDBProps;

  beforeEach(() => {
    BASE_CONFIG = {
      prefix: 'abides-',
      tableConfig: {
        hashKey: '123',
        attribute: [
          {
            name: 'attribeautiful',
            type: 'shrugs!',
          },
        ],
        globalSecondaryIndex: [],
      },
    };
  });

  it('renders dynamo db table with minimal config', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table with read capacity', () => {
    BASE_CONFIG.readCapacity = {
      tracking: 1,
      max: 10,
      min: 3,
    };

    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table with write capacity', () => {
    BASE_CONFIG.writeCapacity = {
      tracking: 1,
      max: 10,
      min: 3,
    };

    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table with read and write capacity', () => {
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

    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table with read and write capacity and tags', () => {
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

    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table global secondary indexes', () => {
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

    (
      BASE_CONFIG.tableConfig
        .globalSecondaryIndex as dynamodb.DynamodbTableGlobalSecondaryIndex[]
    ).push({
      name: 'card-index',
      hashKey: 'card-type',
      rangeKey: 'home_on_the_range',
      projectionType: 'ALL',
      readCapacity: 5,
      writeCapacity: 5,
    });

    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table with 2 global secondary indexes', () => {
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

    //This test runs after the first secondary index test, so here we just add another index which gives us 2
    (
      BASE_CONFIG.tableConfig
        .globalSecondaryIndex as dynamodb.DynamodbTableGlobalSecondaryIndex[]
    ).push({
      name: 'card-index-2',
      hashKey: 'card-type-123',
      rangeKey: 'home_home_on_the_range',
      projectionType: 'ALL',
      readCapacity: 10,
      writeCapacity: 10,
    });

    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table that is not protected from being destroyed', () => {
    BASE_CONFIG.preventDestroyTable = false;

    const synthed = Testing.synthScope((stack) => {
      const applicationDynamoDBTable = new ApplicationDynamoDBTable(
        stack,
        'testDynamoDBTable',
        BASE_CONFIG
      );

      expect(
        applicationDynamoDBTable.dynamodb.lifecycle.preventDestroy
      ).toEqual(false);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders dynamo db table with on-demand capacity', () => {
    BASE_CONFIG.capacityMode = ApplicationDynamoDBTableCapacityMode.ON_DEMAND;
    const synthed = Testing.synthScope((stack) => {
      new ApplicationDynamoDBTable(stack, 'testDynamoDBTable', BASE_CONFIG);
    });
    expect(synthed).toMatchSnapshot();
  });
});

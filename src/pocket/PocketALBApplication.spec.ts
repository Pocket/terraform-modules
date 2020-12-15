import { TerraformStack, Testing } from 'cdktf';
import {
  PocketALBApplication,
  PocketALBApplicationProps,
} from './PocketALBApplication';

describe('PocketALBApplication', () => {
  let BASE_CONFIG: PocketALBApplicationProps;

  beforeEach(() => {
    BASE_CONFIG = {
      prefix: 'testapp',
      alb6CharacterPrefix: 'TSTAPP',
      domain: 'testing.bowling.gov',
      containerConfigs: [],
      codeDeploy: {
        useCodeDeploy: false,
        snsNotificationTopicArn: 'notify-me',
      },
      ecsIamConfig: {
        prefix: 'testapp-',
        taskExecutionDefaultAttachmentArn: '',
        taskExecutionRolePolicyStatements: [],
        taskRolePolicyStatements: [],
      },
      exposedContainer: {
        name: 'main_container',
        port: 8675309,
        healthCheckPath: '/test',
      },
    };
  });

  it('renders an application with minimal config', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an external application', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.internal = false;
    BASE_CONFIG.cdn = true;

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an internal application', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.internal = true;
    BASE_CONFIG.cdn = false;

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an application with custom task sizes', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.taskSize = {
      cpu: 8675,
      memory: 309,
    };

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('throws an error trying for an internal app with a cdn', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.internal = true;
    BASE_CONFIG.cdn = true;

    expect(() => {
      new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);
    }).toThrow('You can not have a cached ALB and have it be internal.');

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an internal application with tags', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.internal = true;
    BASE_CONFIG.cdn = false;
    BASE_CONFIG.tags = {
      name: 'thedude',
      hobby: 'bowling',
    };

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an application with autoscaling group and tags', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.tags = {
      name: 'thedude',
      hobby: 'bowling',
    };

    BASE_CONFIG.autoscalingConfig = {
      targetMinCapacity: 1,
      targetMaxCapacity: 2,
      stepScaleInAdjustment: -1,
      stepScaleOutAdjustment: 2,
      scaleInThreshold: 30,
      scaleOutThreshold: 45,
    };

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an application with default autoscaling group and tags', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.tags = {
      name: 'thedude',
      hobby: 'bowling',
    };

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an application with modified container def protocol, cpu and memory reservation', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.containerConfigs = [
      {
        name: 'xray-daemon',
        hostPort: 0,
        containerPort: 2000,
        protocol: 'udp',
        cpu: 10,
        memoryReservation: 50,
      },
    ];

    new PocketALBApplication(stack, 'testPocketApp', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });
});

import { Testing, TerraformStack } from 'cdktf';
import { PocketALBApplication } from './PocketALBApplication';

test('renders an application with minimal config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketALBApplication(stack, 'testPocketApp', {
    prefix: 'testapp-',
    alb6CharacterPrefix: 'TSTAPP',
    domain: 'testing.bowling.gov',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an external application', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketALBApplication(stack, 'testPocketApp', {
    prefix: 'testapp-',
    alb6CharacterPrefix: 'TSTAPP',
    domain: 'testing.bowling.gov',
    internal: false,
    cdn: true,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an internal application', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketALBApplication(stack, 'testPocketApp', {
    prefix: 'testapp-',
    alb6CharacterPrefix: 'TSTAPP',
    domain: 'testing.bowling.gov',
    internal: true,
    cdn: false,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('throws an error trying for an internal app with a cdn', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  expect(() => {
    new PocketALBApplication(stack, 'testPocketApp', {
      prefix: 'testapp-',
      alb6CharacterPrefix: 'TSTAPP',
      domain: 'testing.bowling.gov',
      internal: true,
      cdn: true,
    });
  }).toThrow('You can not have a cached ALB and have it be internal.');

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an internal application with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketALBApplication(stack, 'testPocketApp', {
    prefix: 'testapp-',
    alb6CharacterPrefix: 'TSTAPP',
    domain: 'testing.bowling.gov',
    internal: true,
    cdn: false,
    tags: {
      name: 'thedude',
      hobby: 'bowling',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

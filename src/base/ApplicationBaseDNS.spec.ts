import { Testing, TerraformStack } from 'cdktf';
import { TestResource } from '../testHelpers';
import { ApplicationBaseDNS } from './ApplicationBaseDNS';

describe('ApplicationBaseDNS', () => {
  let app;
  let stack;

  const tags = {
    name: 'thedude',
    hobby: 'bowling',
  };

  beforeEach(() => {
    app = Testing.app();
    stack = new TerraformStack(app, 'test');
  });

  describe('retrieveAwsRoute53Zone', () => {
    it('retrieves a route 53 zone', () => {
      const construct = new TestResource(stack, 'test-resource');

      ApplicationBaseDNS.retrieveAwsRoute53Zone(
        construct,
        'some-zone',
        'dev.gobowling.info'
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateRoute53Zone', () => {
    it('renders a route 53 zone', () => {
      const construct = new TestResource(stack, 'test-resource');

      ApplicationBaseDNS.generateRoute53Zone(construct, 'dev.gobowling.info');

      expect(Testing.synth(stack)).toMatchSnapshot();
    });

    it('renders a route 53 zone with tags', () => {
      const construct = new TestResource(stack, 'test-resource');

      ApplicationBaseDNS.generateRoute53Zone(
        construct,
        'dev.gobowling.info',
        tags
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateRoute53Record', () => {
    it('renders a route 53 record', () => {
      const construct = new TestResource(stack, 'test-resource');

      ApplicationBaseDNS.generateRoute53Record(
        construct,
        'dev.gobowling.info',
        'some-zone-id',
        ['some', 'records']
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('constructor', () => {
    it('renders base DNS without tags', () => {
      new ApplicationBaseDNS(stack, 'testDNS', {
        domain: 'dev.gobowling.info',
      });

      expect(Testing.synth(stack)).toMatchSnapshot();
    });

    it('renders base DNS with tags', () => {
      new ApplicationBaseDNS(stack, 'testDNS', {
        domain: 'dev.gobowling.info',
        tags: tags,
      });

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });
});

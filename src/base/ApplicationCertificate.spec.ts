import { Testing, TerraformStack } from 'cdktf';
import { TestResource } from '../testHelpers';
import { ApplicationCertificate } from './ApplicationCertificate';

describe('ApplicationCertificate', () => {
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

  describe('generateAcmCertificate', () => {
    it('renders an acm certificate without tags', () => {
      ApplicationCertificate.generateAcmCertificate(
        stack,
        'dev.gobowling.info'
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });

    it('renders an acm certificate with tags', () => {
      ApplicationCertificate.generateAcmCertificate(
        stack,
        'dev.gobowling.info',
        tags
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateRoute53Record', () => {
    it('renders a route 53 record', () => {
      const construct = new TestResource(stack, 'test-resource');

      const cert = ApplicationCertificate.generateAcmCertificate(
        stack,
        'dev.gobowling.info'
      );

      ApplicationCertificate.generateRoute53Record(
        construct,
        'dev.gobowling.info',
        cert
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('generateAcmCertificateValidation', () => {
    it('renders an acm certificate validation', () => {
      const construct = new TestResource(stack, 'test-resource');

      const cert = ApplicationCertificate.generateAcmCertificate(
        stack,
        'dev.gobowling.info'
      );

      const record = ApplicationCertificate.generateRoute53Record(
        construct,
        'dev.gobowling.info',
        cert
      );

      ApplicationCertificate.generateAcmCertificateValidation(
        construct,
        cert,
        record
      );

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });

  describe('constructor', () => {
    it('throws an error without a zone id or zone domain', () => {
      const app = Testing.app();
      const stack = new TerraformStack(app, 'test');

      expect(() => {
        new ApplicationCertificate(stack, 'testCert', {
          domain: 'dev.gobowling.info',
        });
      }).toThrow('You need to pass either a zone id or a zone domain');
    });

    it('renders a cert with a zone id', () => {
      const app = Testing.app();
      const stack = new TerraformStack(app, 'test');

      new ApplicationCertificate(stack, 'testCert', {
        domain: 'dev.gobowling.info',
        zoneId: 'malibu',
      });

      expect(Testing.synth(stack)).toMatchSnapshot();
    });

    it('renders a cert with a zone domain', () => {
      const app = Testing.app();
      const stack = new TerraformStack(app, 'test');

      new ApplicationCertificate(stack, 'testCert', {
        domain: 'dev.gobowling.info',
        zoneId: 'gobowling.info',
      });

      expect(Testing.synth(stack)).toMatchSnapshot();
    });

    it('renders a cert with tags', () => {
      const app = Testing.app();
      const stack = new TerraformStack(app, 'test');

      new ApplicationCertificate(stack, 'testCert', {
        domain: 'dev.gobowling.info',
        zoneId: 'gobowling.info',
        tags: {
          name: 'thedude',
          hobby: 'bowling',
        },
      });

      expect(Testing.synth(stack)).toMatchSnapshot();
    });
  });
});

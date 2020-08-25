import { expect } from 'chai';
import { getRootDomain } from './utilities';

describe('utlities', () => {
  describe('getRootDomain()', () => {
    it('gets root domain when root is the domain', () => {
      expect(getRootDomain('getpocket.com')).to.equal('getpocket.com');
    });

    it('gets root domain when root has a subdomain', () => {
      expect(getRootDomain('feature.getpocket.com')).to.equal('getpocket.com');
    });

    it('gets root domain when root has multiple subdomains', () => {
      expect(getRootDomain('test.feature.getpocket.com')).to.equal(
        'getpocket.com'
      );
    });

    it('gets root domain when domain is www', () => {
      expect(getRootDomain('www.getpocket.com')).to.equal('getpocket.com');
    });
  });
});

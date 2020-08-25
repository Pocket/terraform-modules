import { expect } from 'chai';
import { getRootDomain } from './utilities';

describe('utlities', () => {
  describe('getRootDomain()', () => {
    it('gets root domain when root is the domain', () => {
      expect(getRootDomain('getpocket.com')).to.equal('getpocket.com');
    });
  });
});

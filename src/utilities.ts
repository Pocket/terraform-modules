import { parseDomain, ParseResultListed, ParseResultType } from 'parse-domain';

/**
 * Takes a domain like test.getpocket.com and returns the root level domain (getpocket.com)
 * @param inputDomain
 */
export const getRootDomain = (inputDomain: string): string => {
  const parseResult = parseDomain(inputDomain);

  if (parseResult.type == ParseResultType.Invalid) {
    throw new Error('Invalid domain');
  }
  const { domain, topLevelDomains } = parseResult as ParseResultListed;
  return `${domain}.${topLevelDomains.join('.')}`;
};

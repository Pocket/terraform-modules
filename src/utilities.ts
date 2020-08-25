import { parseDomain, ParseResultListed, ParseResultType } from 'parse-domain';

export const getRootDomain = (inputDomain: string): string => {
  const parseResult = parseDomain(inputDomain);

  if (parseResult.type == ParseResultType.Invalid) {
    throw new Error('Invalid domain');
  }
  const { domain, topLevelDomains } = parseResult as ParseResultListed;
  return `${domain}.${topLevelDomains.join('.')}`;
};

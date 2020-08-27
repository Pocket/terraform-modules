# terraform-modules

This is a collection of terraform typescript cdk modules
that @Pocket uses in various services.

## Contributing

We use standard changelog and enforce [conventional commits](https://www.conventionalcommits.org/).

### Commit format

Commits should be formated as `type(scope): message`

The following types are allowed:

| Type | Description |
|---|---|
| feat | A new feature |
| fix | A bug fix |
| docs | Documentation only changes |
| style | Changes that do not affect the meaning of the code (white-space, formatting,missing semi-colons, etc) |
| refactor | A code change that neither fixes a bug nor adds a feature |
| perf | A code change that improves performance |
| test | Adding missing or correcting existing tests |
| chore | Changes to the build process or auxiliary tools and libraries such as documentation generation |

### Releasing

A new version is released when a merge or push to `main` occurs.

We use the rules at [default-release-rules.js](https://github.com/semantic-release/commit-analyzer/blob/master/lib/default-release-rules.js) as our guide to when a a series of commits should create a release.


### Testing in other Repo

Sometimes it is useful to develop the module while consuming it in another repo.

1. Run `npm link` in the root of this repo
2. In the consumer repo run `npm link @pocket/terraform-modules`
3. In this repo run `npm run watch`
4. Profit in the consumer repo

When you are done be sure to:
1. `npm unlink` in this repo
2. `npm unlink @pocket/terraform-modules` in the consuming repo

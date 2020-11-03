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

### Snapshot testing

Snapshot testing ensures that our components produce predictable output when synthesized.

When a snapshot test is first run, it generates a snapshot (in a `__snapshots__` directory) that is used to compare future synthesizing against a known, expected output. If a component changes, it's likely that the expected snapshot should change. If you are making a PR that changes a component, you should also update the related snapshot file. This can be done by running the test command with additional flags instructing Jest to re-build the snapshot based on the new state of the component:

`npm test -- -u`

The above will update any necessary snapshot files to be used on future test runs.

As you can infer from the above, snapshots do not test the actual infrastructure result of running the synthesized terraform, meaning components should be tested manually (see below) to ensure they are performing the expected tasks prior to writing snapshot tests.

### Testing in this repo

You can use the existing `example.ts` file to test the modules in this repo.

1. Comment out the `RemoteBackend` block in `example.ts`
2. Run `npm run build && npm run synth`
3. `cd` into the generated `cdktf.out` directory
4. Run `terraform init`
5. Run `terraform validate` to validate the generated JSON (debugging level 1)

To test against our infrastructure (debugging level 2):

1. Run `$(maws)` and select the 👉dev👈 backend SSO role (triple check that you are in DEV)
2. Run `terraform plan`
3. Check one more time that you are in the dev account
4. Check with your teammates that it's okay to blow up the dev infra, then run `terraform apply`
5. Clean up your mess by running `terraform destroy` when you're all done

Note that this isn't a full end-to-end verification, and will hang on domain certificate steps, but the above should surface most generated terraform issues.

### Testing in other Repo

Sometimes it is useful to develop the module while consuming it in another repo.

1. Run `npm link` in the root of this repo
2. In the consumer repo run `npm link @pocket/terraform-modules`
3. In this repo run `npm run watch`
4. Profit in the consumer repo

When you are done be sure to:
1. `npm unlink` in this repo
2. `npm unlink @pocket/terraform-modules` in the consuming repo


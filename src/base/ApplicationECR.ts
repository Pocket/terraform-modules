import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  EcrLifecyclePolicy,
  EcrLifecyclePolicyConfig,
  EcrRepository,
  EcrRepositoryConfig,
} from '@cdktf/provider-aws';

export interface ECRProps {
  name: string;
  tags?: { [key: string]: string };
}

export class ApplicationECR extends Resource {
  public readonly repo: EcrRepository;

  constructor(scope: Construct, name: string, config: ECRProps) {
    super(scope, name);

    const ecrConfig: EcrRepositoryConfig = {
      name: config.name,
      tags: config.tags,
      imageScanningConfiguration: [
        {
          scanOnPush: true, // scans docker image for vulnerabilities
        },
      ],
    };

    this.repo = new EcrRepository(this, 'ecr-repo', ecrConfig);

    // this is our default policy
    // perhaps this should be defined elsewhere? or allow to be overwritten?
    // decisions for another day...
    const policy = {
      rules: [
        {
          rulePriority: 1,
          description: 'expire old images',
          selection: {
            tagStatus: 'any',
            countType: 'imageCountMoreThan',
            countNumber: 800,
          },
          action: {
            type: 'expire',
          },
        },
      ],
    };

    const ecrPolicyConfig: EcrLifecyclePolicyConfig = {
      repository: this.repo.name,
      policy: JSON.stringify(policy),
      dependsOn: [this.repo],
    };

    new EcrLifecyclePolicy(this, 'ecr-repo-lifecyclepolicy', ecrPolicyConfig);
  }
}

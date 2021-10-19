import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { CodePipeline, IAM, KMS, S3 } from '@cdktf/provider-aws';
import crypto from 'crypto';

export interface PocketECSCodePipelineProps {
  prefix: string;
  source: {
    repository: string;
    branchName: string;
    codeStarConnectionArn: string;
  };
  codeBuildProjectName?: string;
  codeDeploy?: {
    applicationName?: string;
    deploymentGroupName?: string;
    appSpecPath?: string;
    taskDefPath?: string;
  };
  tags?: { [key: string]: string };
}

export class PocketECSCodePipeline extends Resource {
  private static DEFAULT_TASKDEF_PATH = 'taskdef.json';
  private static DEFAULT_APPSPEC_PATH = 'appspec.json';

  public readonly codePipeline: CodePipeline.Codepipeline;

  constructor(
    scope: Construct,
    name: string,
    private config: PocketECSCodePipelineProps
  ) {
    super(scope, name);

    this.codePipeline = this.createCodePipeline();
  }

  /**
   * Create a CodePipeline that runs CodeBuild and ECS CodeDeploy
   * @private
   */
  private createCodePipeline(): CodePipeline.Codepipeline {
    const pipelineRole = this.createPipelineRole();

    const s3KmsAlias = new KMS.DataAwsKmsAlias(this, 'kms_s3_alias', {
      name: 'alias/aws/s3',
    });

    const pipelineArtifactBucket = this.createArtifactBucket();

    const codeBuildProjectName =
      this.config.codeBuildProjectName ?? this.config.prefix;

    const codeDeployApplicationName =
      this.config.codeDeploy?.applicationName ?? `${this.config.prefix}-ECS`;

    const codeDeployDeploymentGroupName =
      this.config.codeDeploy?.deploymentGroupName ??
      `${this.config.prefix}-ECS`;

    this.attachPipelineRolePolicy(
      pipelineRole,
      pipelineArtifactBucket,
      codeBuildProjectName,
      codeDeployApplicationName,
      codeDeployDeploymentGroupName
    );

    return new CodePipeline.Codepipeline(this, 'codepipeline', {
      name: `${this.config.prefix}-CodePipeline`,
      roleArn: pipelineRole.arn,
      artifactStore: [
        {
          location: pipelineArtifactBucket.bucket,
          type: 'S3',
          encryptionKey: { id: s3KmsAlias.arn, type: 'KMS' },
        },
      ],
      stage: [
        {
          name: 'Source',
          action: [
            {
              name: 'GitHub_Checkout',
              category: 'Source',
              owner: 'AWS',
              provider: 'CodeStarSourceConnection',
              version: '1',
              outputArtifacts: ['SourceOutput'],
              configuration: {
                ConnectionArn: this.config.source.codeStarConnectionArn,
                FullRepositoryId: this.config.source.repository,
                BranchName: this.config.source.branchName,
                DetectChanges: 'false',
              },
              namespace: 'SourceVariables',
            },
          ],
        },
        {
          name: 'Deploy',
          action: [
            {
              name: 'CodeBuild',
              category: 'Build',
              owner: 'AWS',
              provider: 'CodeBuild',
              inputArtifacts: ['SourceOutput'],
              outputArtifacts: ['CodeBuildOutput'],
              version: '1',
              configuration: {
                ProjectName: codeBuildProjectName,
                EnvironmentVariables: `[${JSON.stringify({
                  name: 'GIT_BRANCH',
                  value: '#{SourceVariables.BranchName}',
                })}]`,
              },
              runOrder: 1,
            },
            {
              name: 'Deploy_ECS',
              category: 'Deploy',
              owner: 'AWS',
              provider: 'CodeDeployToECS',
              inputArtifacts: ['CodeBuildOutput'],
              version: '1',
              configuration: {
                ApplicationName: codeDeployApplicationName,
                DeploymentGroupName: codeDeployDeploymentGroupName,
                TaskDefinitionTemplateArtifact: 'CodeBuildOutput',
                TaskDefinitionTemplatePath:
                  this.config.codeDeploy?.taskDefPath ??
                  PocketECSCodePipeline.DEFAULT_TASKDEF_PATH,
                AppSpecTemplateArtifact: 'CodeBuildOutput',
                AppSpecTemplatePath:
                  this.config.codeDeploy?.appSpecPath ??
                  PocketECSCodePipeline.DEFAULT_APPSPEC_PATH,
              },
              runOrder: 2,
            },
          ],
        },
      ],
      tags: this.config.tags,
    });
  }

  /**
   * Create CodePipeline artifact s3 bucket
   * @private
   */
  private createArtifactBucket() {
    const prefixHash = crypto
      .createHash('md5')
      .update(this.config.prefix)
      .digest('hex');

    return new S3.S3Bucket(this, 'codepipeline-bucket', {
      bucket: `pocket-codepipeline-${prefixHash}`,
      acl: 'private',
      forceDestroy: true,
      tags: this.config.tags,
    });
  }

  /**
   * Attach IAM policy to the pipeline role
   * @param pipelineRole
   * @param pipelineArtifactBucket
   * @param codeBuildProjectName
   * @param codeDeployApplicationName
   * @param codeDeployDeploymentGroupName
   * @private
   */
  private attachPipelineRolePolicy(
    pipelineRole: IAM.IamRole,
    pipelineArtifactBucket: S3.S3Bucket,
    codeBuildProjectName: string,
    codeDeployApplicationName: string,
    codeDeployDeploymentGroupName: string
  ) {
    new IAM.IamRolePolicy(this, 'codepipeline-role-policy', {
      name: `${this.config.prefix}-CodePipeline-Role-Policy`,
      role: pipelineRole.id,
      policy: new IAM.DataAwsIamPolicyDocument(
        this,
        `codepipeline-role-policy-document`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['codestar-connections:UseConnection'],
              resources: [this.config.source.codeStarConnectionArn],
            },
            {
              effect: 'Allow',
              actions: [
                'codebuild:BatchGetBuilds',
                'codebuild:StartBuild',
                'codebuild:BatchGetBuildBatches',
                'codebuild:StartBuildBatch',
              ],
              resources: [
                `arn:aws:codebuild:*:*:project/${codeBuildProjectName}`,
              ],
            },
            {
              effect: 'Allow',
              actions: [
                'codedeploy:CreateDeployment',
                'codedeploy:GetApplication',
                'codedeploy:GetApplicationRevision',
                'codedeploy:GetDeployment',
                'codedeploy:RegisterApplicationRevision',
                'codedeploy:GetDeploymentConfig',
              ],
              resources: [
                `arn:aws:codedeploy:*:*:application:${codeDeployApplicationName}`,
                `arn:aws:codedeploy:*:*:deploymentgroup:${codeDeployApplicationName}/${codeDeployDeploymentGroupName}`,
                'arn:aws:codedeploy:*:*:deploymentconfig:*',
              ],
            },
            {
              effect: 'Allow',
              actions: [
                's3:GetObject',
                's3:GetObjectVersion',
                's3:GetBucketVersioning',
                's3:PutObjectAcl',
                's3:PutObject',
              ],
              resources: [
                pipelineArtifactBucket.arn,
                `${pipelineArtifactBucket.arn}/*`,
              ],
            },
            {
              effect: 'Allow',
              actions: ['iam:PassRole'],
              resources: ['*'],
              condition: [
                {
                  variable: 'iam:PassedToService',
                  test: 'StringEqualsIfExists',
                  values: ['ecs-tasks.amazonaws.com'],
                },
              ],
            },
            {
              effect: 'Allow',
              actions: ['ecs:RegisterTaskDefinition'],
              resources: ['*'],
            },
          ],
        }
      ).json,
    });
  }

  /**
   * Creates a CodePipeline role.
   * @private
   */
  private createPipelineRole() {
    return new IAM.IamRole(this, 'codepipeline-role', {
      name: `${this.config.prefix}-CodePipelineRole`,
      assumeRolePolicy: new IAM.DataAwsIamPolicyDocument(
        this,
        `codepipeline-assume-role-policy`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sts:AssumeRole'],
              principals: [
                {
                  identifiers: ['codepipeline.amazonaws.com'],
                  type: 'Service',
                },
              ],
            },
          ],
        }
      ).json,
    });
  }
}

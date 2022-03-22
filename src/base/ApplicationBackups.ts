import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {backup } from '@cdktf/provider-aws';
import BackupVault = backup.BackupVault;
import BackupVaultPolicy = backup.BackupVaultPolicy;
import BackupPlan = backup.BackupPlan;
import BackupSelection = backup.BackupSelection;
import BackupPlanRule = backup.BackupPlanRule;

export interface ApplicationBackupProps {
  name: string;
  kmsKeyArn: string;
  prefix: string;
  accountId: string;
  vaultPolicy: string;
  backupPlans: {
    name: string;
    resources: string[];
    rules: Omit<BackupPlanRule, 'targetVaultName'>[];
    selectionTag: backup.BackupSelectionSelectionTag[];
  }[];
  tags?: { [key: string]: string };
}

export class ApplicationBackup extends Resource {
  public backupPlan: backup.BackupPlan;
  public backupSelection: backup.BackupSelection;
  public backupPlanRule: backup.BackupPlanRule;
  private static vault: backup.BackupVault;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationBackupProps
  ) {
    super(scope, name);

    const vault = new BackupVault(this, 'backup-vault', {
      name: `${config.prefix}-${config.name}`,
      kmsKeyArn: config.kmsKeyArn,
      tags: config.tags,
    });

    new BackupVaultPolicy(this, 'backup-vault-policy', {
      backupVaultName: vault.name,
      policy: config.vaultPolicy,
    });

    config.backupPlans.forEach((plan) => {
      const backupPlan = new BackupPlan(this, 'backup-plan', {
        name: plan.name,
        rule: plan.rules.map((rule) => ({
          ...rule,
          targetVaultName: vault.name,
        })),
        tags: config.tags,
      });

      new BackupSelection(this, 'backup-selection', {
        name: `${config.prefix}-Backup-Selection`,
        planId: backupPlan.id,
        iamRoleArn: `arn:aws:iam::${config.accountId}:role/service-role/AWSBackupDefaultServiceRole`,
        resources: plan.resources,
        selectionTag: plan.selectionTag,
      });
    });
  }
}

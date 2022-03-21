import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import { Backup } from '@cdktf/provider-aws';
import BackupVault = Backup.BackupVault;
import BackupVaultPolicy = Backup.BackupVaultPolicy;
import BackupPlan = Backup.BackupPlan;
import BackupSelection = Backup.BackupSelection;
import BackupPlanRule = Backup.BackupPlanRule;

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
    selectionTag: Backup.BackupSelectionSelectionTag[];
  }[];
  tags?: { [key: string]: string };
}

export class ApplicationBackup extends Resource {
  public backupPlan: Backup.BackupPlan;
  public backupSelection: Backup.BackupSelection;
  public backupPlanRule: Backup.BackupPlanRule;
  private static vault: Backup.BackupVault;

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

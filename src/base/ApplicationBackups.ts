import { Construct } from 'constructs';
import { App, TerraformStack, Resource } from 'cdktf';
import { AwsProvider, Backup, IAM } from '@cdktf/provider-aws';
// import BackupVault = Backup.BackupVault;

export interface ApplicationBackupProps {
    BackupVaultName: string;
    backupName: string;
    backupPlanName: string;
    backupPlanRuleName: string;
    backupPlanSelectionName: string;
    backupPlanResourceSelection: string[];
    backupIamRole: string;
    backupSchedule: string;
    // arn: string;
    // awsBackupVault: string;
    // tags?: { [key: string]: string };
}

export class ApplicationBackup extends TerraformStack {
// export class ApplicationBackup extends Resource {
    public backupPlan: Backup.BackupPlan;
    public backupSelection: Backup.BackupSelection;
    public backupPlanRule: Backup.BackupPlanRule;
    // private static vault: Backup.BackupVault=null;
    private static vault: Backup.BackupVault;
    // public readonly config: ApplicationBackupProps;

  constructor(
      scope: Construct, 
      name: string, 
      config: ApplicationBackupProps) 
      {
        super(scope, name);
        
        new AwsProvider(this, 'aws', {
            region: 'us-east-1',
            // sharedCredentialsFile: 'tf.creds',
            // profile: 'default'
         });

        // Backup.BackupGlobalSettings
        // if vault exists do not create it
        // if (ApplicationBackup.vault === null) {
            ApplicationBackup.vault = new Backup.BackupVault(this, config.BackupVaultName, {
                name: config.BackupVaultName,
            });
        // }   

        // this.backupPlan = new Backup.BackupPlan(this, config.backupPlanName, {
        //     name: config.backupName,
        //     rule: [ {
        //         ruleName: config.backupPlanRuleName,
        //         targetVaultName: config.name
        //     }]
        // })

        // must run before backupPlanSelection so it can get backupPlan.id
        this.backupPlan = this.backupPlanSet(config.backupPlanName, config.backupPlanRuleName, config.BackupVaultName, config.backupSchedule);

        this.backupSelection = this.backupSelectionSet(config.backupPlanSelectionName, config.backupPlanName, this.backupPlan.id, config.backupIamRole, config.backupPlanResourceSelection);

        // const backupPlanSelection = new Backup.BackupSelection(this, config.backupPlanSelectionName, {

        //     name: config.backupPlanName,
        //     planId: this.backupPlan.id,
        //     //iamRoleArn: this.backupPlan.arn,
        //     iamRoleArn: config.backupIamRole,
        //     resources: config.backupPlanResourceSelection
        // }) 
    }

    private backupPlanSet(backupPlanName, ruleName, targetVaueName, backupSchedule): Backup.BackupPlan {
        return new Backup.BackupPlan(this, backupPlanName, {
            name: backupPlanName,
            rule: [ {
                ruleName: ruleName,
                targetVaultName: targetVaueName,
                recoveryPointTags: {},
                schedule: backupSchedule                
        }]})
    }
  
    
    private backupSelectionSet(backupPlanSelectionName, backupPlanName, backupPlanId, backupIamRole, backupPlanResourceSelection): Backup.BackupSelection {
        return new Backup.BackupSelection(this, backupPlanSelectionName, {
            name: backupPlanName,
            planId: backupPlanId,
            iamRoleArn: backupIamRole,
            resources: backupPlanResourceSelection
        })
    }



    

}
    
  
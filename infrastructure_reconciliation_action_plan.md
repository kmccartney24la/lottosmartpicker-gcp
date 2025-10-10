# Infrastructure Reconciliation - Final Action Plan

Based on the comprehensive analysis of both the Terraform configuration and discovered GCP infrastructure, and incorporating all your approvals and feedback, here's the finalized action plan for implementation:

## ✅ APPROVED ACTIONS - Implementation Ready

### 🔴 CRITICAL PRIORITY (Immediate Implementation)

**1. Deploy Missing Monitoring Infrastructure**
- **Action**: Apply security monitoring module from Terraform
- **Status**: ✅ APPROVED
- **Implementation**: `terraform apply -target=module.security_monitoring`
- **Rationale**: Production system lacks critical monitoring and alerting capabilities, creating significant operational risk.

**2. Update Cloud Run Service Scaling**
- **Action**: Update `lottosmartpicker-app` scaling configuration in `infra/modules/run_service_app/main.tf`
- **Status**: ✅ APPROVED
- **Changes**: min=1, max=10, add concurrency=80
- **Rationale**: Current GCP settings appear to be production-tuned and working effectively.

**3. Update Cloud Run Jobs Resource Allocation**
- **Action**: Update job memory allocations in Terraform to match GCP
- **Status**: ✅ APPROVED
- **Changes**: 
  - `update-csvs` (`infra/modules/run_jobs/main.tf`): Memory: 1Gi → 4Gi, add timeout=1200s
  - `scratchers` (`infra/modules/run_jobs/main.tf`): Memory: 4Gi → 8Gi, add timeout=7200s, fix image reference
- **Rationale**: GCP allocations reflect actual resource needs discovered through production usage.

### 🟡 HIGH PRIORITY (Within 1 Week)

**4. Remove `lottosmartpicker-scratchers-web` from GCP**
- **Action**: Decommission the `lottosmartpicker-scratchers-web` Cloud Run service from GCP.
- **Status**: ✅ APPROVED - REMOVE from GCP
- **Rationale**: Service has "Image not found" error and appears obsolete.

**5. Add `seed-socrata` Job to Terraform**
- **Action**: Import and define the `seed-socrata` job in Terraform configuration.
- **Status**: ✅ APPROVED - ADD to Terraform
- **Implementation**: Create resource definition in `infra/extra_resources.tf`.
- **Rationale**: Job is needed for operations and should be managed as code.

**6. Update Scheduler Jobs Configuration**
- **Action**: Update Terraform to match GCP scheduler job names and schedules.
- **Status**: ✅ APPROVED
- **Changes**:
  - `cron-lotto-updater` → `update-csvs-nightly` (Schedule: `30 2 * * *`)
  - `cron-scratchers` → `scratchers-weekly` (Schedule: `5 12 * * 1`)
- **Rationale**: GCP schedules are actively running and appear to be production-optimized.

**7. Update Budget Configuration**
- **Action**: Set the budget amount to $60 USD.
- **Status**: ✅ APPROVED - $60 budget
- **Implementation**: Update `infra/modules/budget/main.tf`.
- **Rationale**: User-specified budget level for cost management.

### 🟢 MEDIUM PRIORITY (Within 2 Weeks)

**8. DNS Zone Management - CORRECTED**
- **Action**: Remove the outdated `lsp-zone` for `lottosmartpicker9000.com` from GCP. Prepare for the transition of `lottosmartpicker.com` (currently Namecheap) to be managed in GCP.
- **Status**: ✅ APPROVED with clarification
- **Correction**: `lottosmartpicker.com` (Namecheap) is in the process of becoming GCP-certified; `lottosmartpicker9000.com` is an old and outdated DNS.
- **Rationale**: Clean up obsolete DNS entries and align with the future state of domain management.

**9. Import Cloud Armor Security Policy**
- **Action**: Add the `lsp-waf` Cloud Armor security policy to Terraform.
- **Status**: ✅ APPROVED
- **Implementation**: Create `infra/modules/security_policy/main.tf`.
- **Rationale**: Security policies should be managed as code for consistency and auditability.

**10. Consolidate SSL Certificates**
- **Action**: Standardize certificate management by consolidating multiple SSL certificates for the same domain.
- **Status**: ✅ APPROVED
- **Implementation**: Align certificate naming and remove redundant certificates.
- **Rationale**: Multiple certificates for the same domain create management complexity.

**11. Consolidate Load Balancer Configurations**
- **Action**: Standardize URL maps and backend buckets.
- **Status**: ✅ APPROVED
- **Implementation**: Remove redundant configurations, standardize naming.
- **Rationale**: Redundant configurations increase complexity and potential for errors.

### 🔵 LOW PRIORITY (Documentation/Cleanup)

**12. Document Extra Service Account**
- **Action**: Document the `scheduler-runner` service account usage.
- **Status**: ✅ APPROVED
- **Note**: This service account is required for scheduler jobs and should be kept as-is.
- **Rationale**: Ensure all active service accounts are documented for clarity.

**13. Google-Managed Artifact Registry Repository**
- **Action**: No action required.
- **Status**: ✅ APPROVED - Leave as-is
- **Rationale**: This is a system-managed repository for source deployments.

**14. Google-Managed Cloud Build Bucket**
- **Action**: No action required.
- **Status**: ✅ APPROVED - Leave as-is
- **Rationale**: This is a system-managed bucket for Cloud Build artifacts.

**15. Update Storage Bucket Location**
- **Action**: Update Terraform bucket location specification for `lottosmartpicker-data`.
- **Status**: ✅ APPROVED
- **Change**: "US" (multi-region) → "US-CENTRAL1" (single region)
- **Rationale**: Regional storage may be more cost-effective and aligns with other resources.

## 📋 Implementation Priority Order

### Phase 1 - Critical (This Week)
1. Deploy missing monitoring infrastructure
2. Update Cloud Run service scaling
3. Update Cloud Run jobs resource allocation
4. Remove broken `lottosmartpicker-scratchers-web` service from GCP

### Phase 2 - High Priority (Next Week)
5. Add `seed-socrata` job to Terraform
6. Update scheduler job configurations
7. Update budget to $60

### Phase 3 - Medium Priority (Following 2 Weeks)
8. Clean up outdated DNS zone (`lottosmartpicker9000.com`)
9. Import security policy to Terraform
10. Consolidate SSL certificates
11. Consolidate load balancer configurations
12. Update storage bucket location

### Phase 4 - Documentation
13. Document `scheduler-runner` service account
14. Update infrastructure documentation
15. Establish drift monitoring procedures

## 🚨 Special Attention Items

**DNS Transition**: The `lottosmartpicker9000.com` zone should be carefully removed as it's outdated. Concurrently, prepare infrastructure for the `lottosmartpicker.com` transition from Namecheap to GCP, ensuring a smooth migration without service disruption.

**Budget Change**: The $60 budget represents a 6x increase from the current $10 setting. Ensure this aligns with expected usage and cost projections to avoid unexpected overruns.

**Service Removal**: The `lottosmartpicker-scratchers-web` removal should be carefully coordinated to ensure no other services or processes have unexpected dependencies on it.

This document serves as the official action plan for infrastructure reconciliation. The infrastructure team can now proceed with implementation following the phased approach outlined above.
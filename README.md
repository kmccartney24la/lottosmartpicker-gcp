# LottoSmartPicker – Google Cloud Migration (Keyless, Best Practices)

This repo deploys a Next.js app to Cloud Run, serves data via GCS + Cloud CDN on
`data.lottosmartpicker9000.com`, and runs two Cloud Run Jobs (CSV updater + GA scratchers scraper).
Prod and staging are separate GCP projects (mirror setup).

## Environments

- **Prod Project:** `lottosmartpicker-prod`
- **Staging Project:** `lottosmartpicker-staging`
- **Region:** `us-central1`
- **App domains:**  
  - Prod: `app.lottosmartpicker9000.com`  
  - Staging: `app-staging.lottosmartpicker9000.com`
- **Data domains (Cloud CDN over GCS):**  
  - Prod: `data.lottosmartpicker9000.com`  
  - Staging: `data-staging.lottosmartpicker9000.com`

## Keyless Auth

- **GitHub Actions → GCP**: Workload Identity Federation (WIF). No JSON keys.
- **Cloud Run / Jobs → GCP**: Application Default Credentials (ADC). No keys.

## Artifacts

- **App image:** Artifact Registry `.../app[/-stg]/lottosmartpicker`
- **Jobs images:** `.../jobs[/-stg]/{lotto-updater,ga-scratchers}`
- **GCS bucket:**  
  - Prod: `gs://lottosmartpicker-data/`  
  - Staging: `gs://lottosmartpicker-data-stg/`  
  - Versioning **ON** (allows rollback).

### Public, Stable Paths (contract)

gs://<bucket>/
ga/
scratchers/
index.json
images/{gameNumber}/... (webp/png)
cash4life.csv
fantasy5.csv
multi/
powerball.csv
megamillions.csv


Equivalent HTTPS via CDN:

https(s)://data[-staging].lottosmartpicker9000.com/<same-path>


## App Container (Next.js standalone)

- `next.config.mjs`:
  ```js
  export default { output: 'standalone' };


## Security & Dependency Management

LottoSmartPicker implements comprehensive security monitoring and dependency management following security best practices.

### Dependency Management
- **Automated Updates**: GitHub Dependabot configured for weekly dependency updates
- **Security Monitoring**: Automatic security vulnerability detection and patching
- **Minimal Attack Surface**: Only 13 production dependencies (vs. typical 100+)
- **Documentation**: Complete dependency management procedures and checklists

**Key Documents**:
- [`DEPENDENCY_MANAGEMENT.md`](DEPENDENCY_MANAGEMENT.md) - Complete dependency management strategy and procedures
- [`QUARTERLY_DEPENDENCY_REVIEW.md`](QUARTERLY_DEPENDENCY_REVIEW.md) - Comprehensive quarterly review checklist
- [`DEPENDENCY_VERIFICATION.md`](DEPENDENCY_VERIFICATION.md) - Setup verification and testing procedures
- [`.github/dependabot.yml`](.github/dependabot.yml) - Dependabot configuration

**Quick Start**:
1. Dependabot runs weekly (Mondays 9:00 AM ET)
2. Security updates applied automatically for patch versions
3. Major updates require manual review
4. Quarterly comprehensive reviews scheduled

### Security Monitoring
- **Enterprise-grade Monitoring**: Cloud Logging integration with structured security events
- **Multi-tier Alerting**: Immediate, escalated, and critical alert policies
- **Comprehensive Coverage**: API security, rate limiting, CSRF protection, and anomaly detection

**Key Documents**:
- [`SECURITY_MONITORING_IMPLEMENTATION.md`](SECURITY_MONITORING_IMPLEMENTATION.md) - Complete monitoring setup
- [`security-monitoring-runbooks.md`](security-monitoring-runbooks.md) - Incident response procedures
- [`security-assessment-phase5-phase6.md`](security-assessment-phase5-phase6.md) - Security assessment and rationale

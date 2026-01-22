# Claude Code Instructions

## Deployment

**ALWAYS deploy by pushing to GitHub on main branch.** The GitHub Actions workflow will automatically run Pulumi to deploy changes.

Do not attempt to run Pulumi locally - use the CI/CD pipeline.

## Infrastructure

- AWS resources are managed via Pulumi in `infra/pulumi/`
- State is stored in S3: `s3://pulumi-state-215629979895`
- OIDC is configured for GitHub Actions to assume `github-actions-pulumi` role

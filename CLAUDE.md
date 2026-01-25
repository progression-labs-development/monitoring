# Claude Code Instructions

## Deployment

**ALWAYS deploy by pushing to GitHub on main branch.** The GitHub Actions workflow will automatically run Pulumi to deploy changes.

Do not attempt to run Pulumi locally - use the CI/CD pipeline.

## Infrastructure

- AWS resources are managed via Pulumi in `infra/pulumi/`
- State is stored in S3: `s3://pulumi-state-215629979895`
- OIDC is configured for GitHub Actions to assume `github-actions-pulumi` role

## Regenerating the Infrastructure Manifest

The `infra/pulumi/infra-manifest.json` file contains ARNs of deployed AWS resources. To regenerate it:

```bash
cd infra/pulumi

# For dev environment
AWS_PROFILE=dev AWS_REGION=eu-west-2 PULUMI_CONFIG_PASSPHRASE="" \
  pulumi login s3://pulumi-state-215629979895 && \
  pulumi stack select dev && \
  pulumi stack export > /tmp/stack-export.json

# For stag environment
AWS_PROFILE=stag AWS_REGION=eu-west-2 PULUMI_CONFIG_PASSPHRASE="" \
  pulumi login s3://pulumi-state-978212996213 && \
  pulumi stack select stag && \
  pulumi stack export > /tmp/stack-export.json

# Generate manifest from export
node -e "
const infra = require('@chrismlittle123/infra');
const fs = require('fs');
const data = fs.readFileSync('/tmp/stack-export.json', 'utf-8');
const m = infra.parseStackExport(JSON.parse(data));
fs.writeFileSync('infra-manifest.json', JSON.stringify(m, null, 2));
console.log('Manifest regenerated with', m.resources.length, 'resources');
"
```

**Note:** Requires AWS credentials configured for the appropriate profile.

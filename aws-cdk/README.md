# Geospatial Data — AWS CDK

Infrastructure-as-Code for serving geospatial data via CloudFront + S3, protected by HTTP Basic Auth.

## Architecture

- **S3 Bucket** — private, SSE-S3 encrypted, SSL-enforced, versioning disabled
- **CloudFront Distribution** — HTTPS-only, Origin Access Control (OAC) to S3
- **CloudFront Function** — Basic Auth + root-to-`/index.html` redirect
- **BucketDeployment** — auto-deploys `assets/index.html` to the bucket
- **Custom Domain (optional)** — bring your own domain and ACM certificate

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/cli.html) (`npm install -g aws-cdk`)
- AWS credentials configured (`aws configure` or environment variables)
- CDK bootstrapped in your target account/region:
  ```bash
  cdk bootstrap aws://ACCOUNT_ID/REGION
  ```

## Setup

```bash
cd aws-cdk
npm install
```

## Configuration

All configuration is passed as CDK context variables (`-c key=value`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `basicAuthPassword` | Yes | — | Password for HTTP Basic Auth |
| `basicAuthUsername` | No | `admin` | Username for HTTP Basic Auth |
| `domainName` | No | — | Custom domain (e.g., `data.example.com`) |
| `certificateArn` | No | — | ACM certificate ARN for the custom domain |

> **Note:** `domainName` and `certificateArn` must be provided together — supplying one without the other will cause an error.

## Deployment

### Basic (CloudFront default domain)

```bash
cdk deploy -c basicAuthPassword=YOUR_PASSWORD
```

After deployment, access the site at the `DistributionDomainName` output (e.g., `d1234abcd.cloudfront.net`).

### With custom domain and SSL

#### Step 1: Create an ACM certificate

The certificate **must** be in the `us-east-1` region (CloudFront requirement).

```bash
aws acm request-certificate \
  --region us-east-1 \
  --domain-name data.example.com \
  --validation-method DNS
```

#### Step 2: Validate the certificate

Add the CNAME record returned by ACM to your DNS provider. Wait until the certificate status is `ISSUED`:

```bash
aws acm describe-certificate \
  --region us-east-1 \
  --certificate-arn arn:aws:acm:us-east-1:ACCOUNT:certificate/ID \
  --query 'Certificate.Status'
```

#### Step 3: Deploy with the custom domain

```bash
cdk deploy \
  -c basicAuthPassword=YOUR_PASSWORD \
  -c domainName=data.example.com \
  -c certificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/ID
```

#### Step 4: Configure DNS

Add a CNAME record at your DNS provider pointing your custom domain to the CloudFront distribution:

```
data.example.com  CNAME  d1234abcd.cloudfront.net
```

The CloudFront domain is available in the `DistributionDomainName` stack output.

## Stack Outputs

| Output | Description |
|---|---|
| `BucketName` | S3 bucket name for uploading data |
| `DistributionDomainName` | CloudFront `*.cloudfront.net` domain |
| `DistributionId` | CloudFront distribution ID (useful for cache invalidation) |
| `CustomDomainName` | Your custom domain (only when configured) |

## Development

```bash
npm run build    # compile TypeScript
npm run watch    # compile on save
npm test         # run tests
cdk synth -c basicAuthPassword=x   # synthesize CloudFormation template
cdk diff -c basicAuthPassword=x    # preview changes before deploy
```

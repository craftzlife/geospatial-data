import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export class OvertureMapsGeospatialDataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Read credentials from CDK context
    const basicAuthUsername = this.node.tryGetContext('basicAuthUsername') ?? 'admin';
    const basicAuthPassword = this.node.tryGetContext('basicAuthPassword');

    if (!basicAuthPassword) {
      throw new Error(
        'Missing required context variable "basicAuthPassword". ' +
        'Pass it via: cdk deploy -c basicAuthPassword=YOUR_PASSWORD'
      );
    }

    // Custom domain and SSL certificate (optional)
    const domainName = this.node.tryGetContext('domainName');
    const certificateArn = this.node.tryGetContext('certificateArn');

    if (domainName && !certificateArn) {
      throw new Error(
        'Context variable "certificateArn" is required when "domainName" is provided.'
      );
    }
    if (!domainName && certificateArn) {
      throw new Error(
        'Context variable "domainName" is required when "certificateArn" is provided.'
      );
    }

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'ImportedCertificate', certificateArn)
      : undefined;

    // S3 Bucket — private, encrypted
    const bucket = new s3.Bucket(this, 'DataBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
    });

    // CloudFront Function — Basic Auth + root redirect
    const encodedCredentials = Buffer.from(`${basicAuthUsername}:${basicAuthPassword}`).toString('base64');

    const basicAuthFunction = new cloudfront.Function(this, 'BasicAuthFunction', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var expected = "Basic ${encodedCredentials}";

  if (!headers.authorization || headers.authorization.value !== expected) {
    return {
      statusCode: 401,
      statusDescription: "Unauthorized",
      headers: {
        "www-authenticate": { value: "Basic realm=\\"Restricted\\"" }
      }
    };
  }

  if (request.uri === "/" && !request.querystring["list-type"]) {
    return {
      statusCode: 302,
      statusDescription: "Found",
      headers: {
        location: { value: "/index.html" }
      }
    };
  }

  return request;
}
      `.trim()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // Cache policy for static content (index.html and data files)
    const staticCachePolicy = new cloudfront.CachePolicy(this, 'StaticContentCachePolicy', {
      defaultTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Origin request policy to forward S3 listing query strings
    const listingOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'ListingOriginRequestPolicy', {
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.allowList(
        'list-type', 'prefix', 'delimiter', 'continuation-token',
      ),
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);

    const functionAssociations = [
      {
        function: basicAuthFunction,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      },
    ];

    // CloudFront Distribution with OAC
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      ...(domainName && certificate
        ? { domainNames: [domainName], certificate }
        : {}),
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: listingOriginRequestPolicy,
        functionAssociations,
      },
      additionalBehaviors: {
        '/index.html': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticCachePolicy,
          functionAssociations,
        },
        'data/*': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticCachePolicy,
          functionAssociations,
        },
      },
    });

    // Grant CloudFront permission to list bucket objects
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [bucket.bucketArn],
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': this.formatArn({
            service: 'cloudfront',
            region: '',
            resource: 'distribution',
            resourceName: distribution.distributionId,
            arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
          }),
        },
      },
    }));

    // Deploy index.html to bucket
    new s3deploy.BucketDeployment(this, 'DeployIndexHtml', {
      sources: [s3deploy.Source.asset('./assets')],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/index.html'],
      prune: false, // Do not delete existing files in the bucket, just add/update the new files
    });

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    if (domainName) {
      new cdk.CfnOutput(this, 'CustomDomainName', { value: domainName });
    }
  }
}

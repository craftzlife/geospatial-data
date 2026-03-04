import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // S3 Bucket — private, encrypted
    const bucket = new s3.Bucket(this, 'DataBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
    });

    // CloudFront Function — Basic Auth + root routing
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
    request.uri = "/index.html";
  }

  return request;
}
      `.trim()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // Cache policy — forward S3 listing query strings
    const cachePolicy = new cloudfront.CachePolicy(this, 'CachePolicy', {
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(
        'list-type', 'prefix', 'delimiter', 'continuation-token',
      ),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // CloudFront Distribution with OAC
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy,
        functionAssociations: [
          {
            function: basicAuthFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
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
    new s3deploy.BucketDeployment(this, 'DeployIndexHtmlPage', {
      sources: [s3deploy.Source.asset('./assets')],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/index.html'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}

import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { OvertureMapsGeospatialDataStack } from '../lib/overture-maps-geospatial-data-stack';

function createStack(context: Record<string, string> = {}): Template {
  const app = new cdk.App({
    context: { basicAuthPassword: 'test-password', ...context },
  });
  const stack = new OvertureMapsGeospatialDataStack(app, 'TestStack');
  return Template.fromStack(stack);
}

describe('S3 Bucket', () => {
  test('has encryption enabled (SSE-S3)', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    });
  });

  test('blocks all public access', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('has versioning disabled', () => {
    const template = createStack();
    const buckets = template.findResources('AWS::S3::Bucket');
    for (const logicalId of Object.keys(buckets)) {
      expect(buckets[logicalId].Properties.VersioningConfiguration).toBeUndefined();
    }
  });

  test('enforces SSL via bucket policy', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  test('has RETAIN removal policy', () => {
    const template = createStack();
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  test('bucket policy grants s3:ListBucket to CloudFront', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:ListBucket',
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
          }),
        ]),
      },
    });
  });
});

describe('CloudFront Distribution', () => {
  test('default behavior has HTTPS redirect', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      },
    });
  });

  test('does not set defaultRootObject (handled by CF function redirect)', () => {
    const template = createStack();
    const distributions = template.findResources('AWS::CloudFront::Distribution');
    for (const logicalId of Object.keys(distributions)) {
      const config = distributions[logicalId].Properties.DistributionConfig;
      expect(config.DefaultRootObject).toBeUndefined();
    }
  });

  test('default behavior has function association on viewer-request', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [
            {
              EventType: 'viewer-request',
              FunctionARN: Match.anyValue(),
            },
          ],
        }),
      },
    });
  });

  test('default behavior uses CACHING_DISABLED policy for listing requests', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: Match.objectLike({
          CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        }),
      },
    });
  });

  test('has additional behaviors for /index.html and data/*', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/index.html',
            ViewerProtocolPolicy: 'redirect-to-https',
          }),
          Match.objectLike({
            PathPattern: 'data/*',
            ViewerProtocolPolicy: 'redirect-to-https',
          }),
        ]),
      },
    });
  });

  test('additional behaviors have function associations on viewer-request', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/index.html',
            FunctionAssociations: [
              {
                EventType: 'viewer-request',
                FunctionARN: Match.anyValue(),
              },
            ],
          }),
          Match.objectLike({
            PathPattern: 'data/*',
            FunctionAssociations: [
              {
                EventType: 'viewer-request',
                FunctionARN: Match.anyValue(),
              },
            ],
          }),
        ]),
      },
    });
  });
});

describe('Cache and Origin Request Policies', () => {
  test('static content cache policy has compression enabled', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: Match.objectLike({
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
          EnableAcceptEncodingGzip: true,
          EnableAcceptEncodingBrotli: true,
        }),
      }),
    });
  });

  test('origin request policy forwards S3 listing query strings', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::OriginRequestPolicy', {
      OriginRequestPolicyConfig: Match.objectLike({
        QueryStringsConfig: {
          QueryStringBehavior: 'whitelist',
          QueryStrings: Match.arrayWith(['list-type', 'prefix', 'delimiter', 'continuation-token']),
        },
      }),
    });
  });
});

describe('Origin Access Control', () => {
  test('is created with s3 signing config', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      }),
    });
  });
});

describe('CloudFront Function', () => {
  test('is created with cloudfront-js-2.0 runtime', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: Match.objectLike({
        Runtime: 'cloudfront-js-2.0',
      }),
    });
  });

  test('contains Basic Auth logic with encoded credentials', () => {
    const template = createStack();
    const expected = Buffer.from('admin:test-password').toString('base64');
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp(expected),
    });
  });

  test('contains root-to-index.html redirect logic', () => {
    const template = createStack();
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp('statusCode: 302'),
    });
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp('location.*"/index.html"'),
    });
  });

  test('uses custom username when provided', () => {
    const template = createStack({ basicAuthUsername: 'myuser' });
    const expected = Buffer.from('myuser:test-password').toString('base64');
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp(expected),
    });
  });

  test('uses default username "admin" when not provided', () => {
    const template = createStack();
    const expected = Buffer.from('admin:test-password').toString('base64');
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp(expected),
    });
  });
});

describe('BucketDeployment', () => {
  test('deploys assets to the S3 bucket', () => {
    const template = createStack();
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      DistributionPaths: ['/index.html'],
    });
  });
});

describe('Context validation', () => {
  test('throws error when basicAuthPassword is not provided', () => {
    const app = new cdk.App();
    expect(() => {
      new OvertureMapsGeospatialDataStack(app, 'TestStack');
    }).toThrow(/Missing required context variable "basicAuthPassword"/);
  });
});

describe('Stack outputs', () => {
  test('exports bucket name, distribution domain, and distribution ID', () => {
    const template = createStack();
    template.hasOutput('BucketName', {});
    template.hasOutput('DistributionDomainName', {});
    template.hasOutput('DistributionId', {});
  });
});

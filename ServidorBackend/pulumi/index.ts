// pulumi/index.ts

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as path from "path";

const config = new pulumi.Config();
const telegramBotToken = config.get("telegramBotToken") || "";
const telegramChatId = config.get("telegramChatId") || "";

// ==========================================================
// 1. DynamoDB Tables
// ==========================================================

// Legacy Table (kept for data preservation as per plan)
const fireEventsTableLegacy = new aws.dynamodb.Table("fire-events", {
  attributes: [
    { name: "sensorId", type: "S" },
    { name: "timestamp", type: "N" },
  ],
  hashKey: "sensorId",
  rangeKey: "timestamp",
  billingMode: "PAY_PER_REQUEST",
  tags: {
    Project: "fire-id",
    Environment: pulumi.getStack(),
    Legacy: "true"
  },
});

// NEW V2 Table (Rich Events)
// PK: event_id
// GSIs: DeviceIdIndex, RiskLevelIndex
const fireEventsTableV2 = new aws.dynamodb.Table("fire-events-v2", {
    attributes: [
        { name: "event_id", type: "S" },
        { name: "device_id", type: "S" },
        { name: "timestamp", type: "N" },
        { name: "risk_level", type: "S" },
    ],
    hashKey: "event_id",
    billingMode: "PAY_PER_REQUEST",
    streamEnabled: true,
    streamViewType: "NEW_IMAGE", // Critical for Lambda trigger
    globalSecondaryIndexes: [
        {
            name: "DeviceIdIndex",
            hashKey: "device_id",
            rangeKey: "timestamp",
            projectionType: "ALL",
        },
        {
            name: "RiskLevelIndex",
            hashKey: "risk_level",
            rangeKey: "timestamp",
            projectionType: "ALL",
        }
    ],
    tags: {
        Project: "fire-id",
        Environment: pulumi.getStack(),
        Version: "2"
    },
});

export const tableNameV2 = fireEventsTableV2.name;
export const tableNameLegacy = fireEventsTableLegacy.name;

// ==========================================================
// 2. S3 Bucket for Evidence
// ==========================================================

const evidenceBucket = new aws.s3.Bucket("fire-evidence-bucket", {
    corsRules: [{
        allowedHeaders: ["*"],
        allowedMethods: ["GET", "PUT", "POST"],
        allowedOrigins: ["*"],
    }],
    forceDestroy: true, // Permitir eliminar con datos
});

// Habilitar ACLs en el bucket (necesario para buckets modernos)
const evidenceBucketOwnershipControls = new aws.s3.BucketOwnershipControls("evidenceBucketOwnershipControls", {
    bucket: evidenceBucket.id,
    rule: {
        objectOwnership: "BucketOwnerPreferred",
    },
});

const evidenceBucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock("evidenceBucketPublicAccessBlock", {
    bucket: evidenceBucket.id,
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false,
});

const evidenceBucketAcl = new aws.s3.BucketAclV2("evidenceBucketAcl", {
    bucket: evidenceBucket.id,
    acl: "public-read",
}, { dependsOn: [evidenceBucketOwnershipControls, evidenceBucketPublicAccessBlock] });

export const evidenceBucketName = evidenceBucket.bucket;

// ==========================================================
// 3. SNS Topic for Notifications
// ==========================================================

const alertsTopic = new aws.sns.Topic("fire-alerts-topic", {});

// Subscribe email
const emailSub = new aws.sns.TopicSubscription("email-sub", {
    topic: alertsTopic.arn,
    protocol: "email",
    endpoint: "pevv2016@gmail.com", 
});

export const alertsTopicArn = alertsTopic.arn;

// ==========================================================
// 3.1 Contacts Table (Dynamic Notification List)
// ==========================================================

const contactsTable = new aws.dynamodb.Table("fire-contacts", {
    attributes: [
        { name: "contact_id", type: "S" }, // UUID
        { name: "type", type: "S" }, // 'email', 'whatsapp', 'telegram'
    ],
    hashKey: "contact_id",
    billingMode: "PAY_PER_REQUEST",
    globalSecondaryIndexes: [
        {
            name: "TypeIndex",
            hashKey: "type",
            projectionType: "ALL",
        }
    ],
    tags: {
        Project: "fire-id",
        Environment: pulumi.getStack(),
    },
});

export const contactsTableName = contactsTable.name;

// ==========================================================
// 4. Serverless Backend (Lambda + API Gateway) - Dashboard (Legacy/Compat)
// ==========================================================

// ... (Existing dashboard infra logic could be here, kept for reference) ...

// ==========================================================
// 5. Lambda: Events Processor (DynamoDB Stream Trigger)
// ==========================================================

// IAM Role for Processor Lambda
const processorRole = new aws.iam.Role("eventsProcessorRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
        }],
    }),
});

// Basic Execution Policy
new aws.iam.RolePolicyAttachment("processorBasicExec", {
    role: processorRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

// Custom Policy: DynamoDB Stream + SNS + S3
const processorPolicy = new aws.iam.RolePolicy("processorPolicy", {
    role: processorRole.id,
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Action: [
                    "dynamodb:GetRecords",
                    "dynamodb:GetShardIterator",
                    "dynamodb:DescribeStream",
                    "dynamodb:ListStreams",
                    "dynamodb:UpdateItem"
                ],
                Effect: "Allow",
                Resource: fireEventsTableV2.streamArn,
            },
            {
                Action: ["dynamodb:UpdateItem"],
                Effect: "Allow",
                Resource: fireEventsTableV2.arn,
            },
            {
                Action: ["sns:Publish"],
                Effect: "Allow",
                Resource: "*", // Permitir publicar en el tópico y a números de teléfono (SMS)
            },
            {
                Action: ["s3:GetObject", "s3:PutObject", "s3:PutObjectAcl"],
                Effect: "Allow",
                Resource: pulumi.interpolate`${evidenceBucket.arn}/*`,
            },
            {
                Action: ["dynamodb:Scan", "dynamodb:Query", "dynamodb:GetItem"],
                Effect: "Allow",
                Resource: [contactsTable.arn, pulumi.interpolate`${contactsTable.arn}/index/*`],
            }
        ],
    },
});

// Lambda Function (Stream Processor)
const eventsProcessor = new aws.lambda.Function("eventsProcessor", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("../lambdas/eventsProcessor"),
    }),
    runtime: "nodejs18.x",
    role: processorRole.arn,
    handler: "index.handler",
    timeout: 30, // Aumentar timeout a 30 segundos
    environment: {
        variables: {
            TABLE_NAME: fireEventsTableV2.name,
            SNS_TOPIC_ARN: alertsTopic.arn,
            S3_BUCKET_NAME: evidenceBucket.bucket,
            CONTACTS_TABLE_NAME: contactsTable.name,
            TELEGRAM_BOT_TOKEN: telegramBotToken,
            TELEGRAM_CHAT_ID: telegramChatId,
        },
    },
});

// Trigger: DynamoDB Stream -> Lambda
new aws.lambda.EventSourceMapping("dynamoStreamMapping", {
    eventSourceArn: fireEventsTableV2.streamArn,
    functionName: eventsProcessor.arn,
    startingPosition: "LATEST",
    batchSize: 1, // Process events one by one for nearly real-time
});

export const processorFunctionName = eventsProcessor.name;

// ==========================================================
// 6. Config Table (Thresholds)
// ==========================================================

const configTable = new aws.dynamodb.Table("fire-config", {
    attributes: [
        { name: "config_id", type: "S" },
    ],
    hashKey: "config_id",
    billingMode: "PAY_PER_REQUEST",
    tags: {
        Project: "fire-id",
        Environment: pulumi.getStack(),
    },
});

// ==========================================================
// 7. Dashboard API (Lambda + API Gateway)
// ==========================================================

// IAM Role for Dashboard API
const dashboardApiRole = new aws.iam.Role("dashboardApiRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
        }],
    }),
});

new aws.iam.RolePolicyAttachment("dashboardApiBasicExec", {
    role: dashboardApiRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

const dashboardApiPolicy = new aws.iam.RolePolicy("dashboardApiPolicy", {
    role: dashboardApiRole.id,
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Action: ["dynamodb:Scan", "dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"],
                Effect: "Allow",
                Resource: [
                    fireEventsTableV2.arn,
                    contactsTable.arn,
                    configTable.arn
                ],
            }
        ],
    },
});

const dashboardApi = new aws.lambda.Function("dashboardApi", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("../lambdas/dashboardApi"),
    }),
    runtime: "nodejs18.x",
    role: dashboardApiRole.arn,
    handler: "index.handler",
    timeout: 30, // Aumentar a 30 segundos para evitar timeouts en Scans
    memorySize: 256, // Aumentar memoria para procesamiento de datos
    environment: {
        variables: {
            EVENTS_TABLE: fireEventsTableV2.name,
            CONTACTS_TABLE: contactsTable.name,
            CONFIG_TABLE: configTable.name,
        },
    },
});

// API Gateway (HTTP API)
const httpApi = new aws.apigatewayv2.Api("fire-dashboard-api", {
    protocolType: "HTTP",
    corsConfiguration: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type"],
    },
});

// Integration
const apiIntegration = new aws.apigatewayv2.Integration("dashboardApiIntegration", {
    apiId: httpApi.id,
    integrationType: "AWS_PROXY",
    integrationUri: dashboardApi.arn,
    payloadFormatVersion: "2.0",
});

// Routes
new aws.apigatewayv2.Route("statusRoute", {
    apiId: httpApi.id,
    routeKey: "GET /status",
    target: pulumi.interpolate`integrations/${apiIntegration.id}`,
});

new aws.apigatewayv2.Route("contactsRoute", {
    apiId: httpApi.id,
    routeKey: "ANY /contacts",
    target: pulumi.interpolate`integrations/${apiIntegration.id}`,
});

new aws.apigatewayv2.Route("contactsIdRoute", {
    apiId: httpApi.id,
    routeKey: "ANY /contacts/{id}",
    target: pulumi.interpolate`integrations/${apiIntegration.id}`,
});

new aws.apigatewayv2.Route("configRoute", {
    apiId: httpApi.id,
    routeKey: "POST /config",
    target: pulumi.interpolate`integrations/${apiIntegration.id}`,
});

// Permission for API Gateway to invoke Lambda
new aws.lambda.Permission("apiGatewayInvoke", {
    action: "lambda:InvokeFunction",
    function: dashboardApi.name,
    principal: "apigateway.amazonaws.com",
    sourceArn: pulumi.interpolate`${httpApi.executionArn}/*/*`,
});

// Stage (Required for deployment)
const apiStage = new aws.apigatewayv2.Stage("apiStage", {
    apiId: httpApi.id,
    name: "$default",
    autoDeploy: true,
});

export const apiUrl = httpApi.apiEndpoint;

// ==========================================================
// 8. S3 Static Website Hosting
// ==========================================================

const webBucket = new aws.s3.Bucket("fire-dashboard-web", {
    website: {
        indexDocument: "index.html",
    },
    forceDestroy: true,
});

// Public Access Block (Allow public read)
const publicAccessBlock = new aws.s3.BucketPublicAccessBlock("webBucketPublicAccessBlock", {
    bucket: webBucket.id,
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false,
});

// Bucket Policy
const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
    bucket: webBucket.id,
    policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": "*",
            "Action": ["s3:GetObject"],
            "Resource": ["${webBucket.arn}/*"]
        }]
    }`,
}, { dependsOn: [publicAccessBlock] });

// Upload Frontend Files
// Note: In a real CI/CD, this would be a separate step. Here we upload for convenience.
const frontendDir = "../FrontendDashboard";
["index.html", "app.js", "config.js"].forEach(file => {
    // We will create config.js dynamically or assume it exists
    // For now, let's just upload index and app.js, user needs to create config.js
    // Or we can generate config.js with the API URL
});

// Generate config.js with API URL
const configJsContent = pulumi.interpolate`window.API_URL = "${httpApi.apiEndpoint}";`;
const configJsObject = new aws.s3.BucketObject("config.js", {
    bucket: webBucket.id,
    content: configJsContent,
    contentType: "application/javascript",
    key: "config.js",
});

const indexHtmlObject = new aws.s3.BucketObject("index.html", {
    bucket: webBucket.id,
    source: new pulumi.asset.FileAsset(path.join(__dirname, "../../../FrontendDashboard/index.html")),
    contentType: "text/html",
    key: "index.html",
});

const appJsObject = new aws.s3.BucketObject("app.js", {
    bucket: webBucket.id,
    source: new pulumi.asset.FileAsset(path.join(__dirname, "../../../FrontendDashboard/app.js")),
    contentType: "application/javascript",
    key: "app.js",
});

export const websiteUrl = webBucket.websiteEndpoint;



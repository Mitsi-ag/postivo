{
  "ServiceName": "postivo",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_URI}:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "DATABASE_URL": "${DATABASE_URL}",
          "DATABASE_SSL": "true",
          "JWT_SECRET": "${JWT_SECRET}",
          "S3_BUCKET": "postivo-media-102301143129",
          "AWS_REGION": "${REGION}",
          "APP_URL": "${APP_URL}",
          "OPENAI_API_KEY": "${OPENAI_API_KEY}",
          "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}",
          "STRIPE_PRICE_PRO": "${STRIPE_PRICE_PRO}",
          "STRIPE_WEBHOOK_SECRET": "${STRIPE_WEBHOOK_SECRET}"
        }
      }
    },
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/AppRunnerECRAccessRole"
    },
    "AutoDeploymentsEnabled": true
  },
  "InstanceConfiguration": {
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB",
    "InstanceRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/PostivoAppRunnerInstanceRole"
  },
  "AutoScalingConfigurationArn": "${AUTOSCALING_ARN}",
  "HealthCheckConfiguration": {
    "Protocol": "TCP",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}

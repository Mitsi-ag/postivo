{
  "ServiceName": "postivo",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_URI}:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "DATABASE_SSL": "true",
          "S3_BUCKET": "postivo-media-102301143129",
          "AWS_REGION": "${REGION}",
          "APP_URL": "${APP_URL}",
          "STRIPE_PRICE_PRO": "${STRIPE_PRICE_PRO}"
        },
        "RuntimeEnvironmentSecrets": {
          "DATABASE_URL": "arn:aws:secretsmanager:ap-southeast-2:${ACCOUNT_ID}:secret:postivo/prod/DATABASE_URL-CW7X3J",
          "JWT_SECRET": "arn:aws:secretsmanager:ap-southeast-2:${ACCOUNT_ID}:secret:postivo/prod/JWT_SECRET-BHyeHI",
          "CREDENTIALS_KEY": "arn:aws:secretsmanager:ap-southeast-2:${ACCOUNT_ID}:secret:postivo/prod/CREDENTIALS_KEY-SbMqJT",
          "STRIPE_SECRET_KEY": "arn:aws:secretsmanager:ap-southeast-2:${ACCOUNT_ID}:secret:postivo/prod/STRIPE_SECRET_KEY-ElpqMa",
          "STRIPE_WEBHOOK_SECRET": "arn:aws:secretsmanager:ap-southeast-2:${ACCOUNT_ID}:secret:postivo/prod/STRIPE_WEBHOOK_SECRET-yNWIbl",
          "OPENAI_API_KEY": "arn:aws:secretsmanager:ap-southeast-2:${ACCOUNT_ID}:secret:postivo/prod/OPENAI_API_KEY-iWfPKo"
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

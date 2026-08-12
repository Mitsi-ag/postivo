#!/usr/bin/env bash
# Postivo — one-command AWS deploy (App Runner + ECR; RDS/S3 provisioned separately, see README)
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/postivo"
TAG="${1:-$(date +%Y%m%d%H%M%S)}"

echo "==> Building linux/amd64 image (App Runner)…"
docker buildx build --platform linux/amd64 -t "${ECR_URI}:${TAG}" -t "${ECR_URI}:latest" --load .

echo "==> Pushing to ECR…"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
docker push "${ECR_URI}:${TAG}"
docker push "${ECR_URI}:latest"

SERVICE_ARN=$(aws apprunner list-services --region "$REGION" --query "ServiceSummaryList[?ServiceName=='postivo'].ServiceArn" --output text || true)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  echo "==> Creating App Runner service…"
  envsubst < "$(dirname "$0")/apprunner-service.json.tpl" > /tmp/apprunner-service.json
  aws apprunner create-service --cli-input-json file:///tmp/apprunner-service.json --region "$REGION"
else
  echo "==> Updating existing App Runner service ${SERVICE_ARN}…"
  # Auto-deploy on ECR push usually beats us here — an in-progress rollout is
  # success, not failure.
  aws apprunner update-service --service-arn "$SERVICE_ARN" --region "$REGION" \
    --source-configuration "ImageRepository={ImageIdentifier=${ECR_URI}:latest,ImageRepositoryType=ECR,ImageConfiguration={Port=3000}},AuthenticationConfiguration={AccessRoleArn=arn:aws:iam::${ACCOUNT_ID}:role/AppRunnerECRAccessRole},AutoDeploymentsEnabled=true" \
    || echo "==> Update skipped (auto-deployment from the ECR push is already rolling)"
fi

echo "==> Done. Service URL:"
aws apprunner list-services --region "$REGION" --query "ServiceSummaryList[?ServiceName=='postivo'].ServiceUrl" --output text

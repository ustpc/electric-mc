#!/usr/bin/env bash
# Create or update the Electric MC notes server in AWS: an on-demand
# DynamoDB table, a role that can use only that table, the Lambda function
# and its public function URL. Safe to run again: it updates what exists.
#
#   OWNERS=you@example.org MODERATORS=chair@example.org,eic@example.org make deploy
#
# OWNERS can ban keys and delete any note; MODERATORS (co-chairs, the EIC)
# can delete any note. Use the email addresses MC has for those accounts.
# The title-hash secret is made on the first deploy and kept after that.
set -euo pipefail
cd "$(dirname "$0")"

ACCOUNT=075439264285
REGION=${REGION:-us-east-2}
FN=${FN:-emc-notes}
TABLE=${TABLE:-emc-notes}
ROLE=${ROLE:-emc-notes-lambda}
: "${OWNERS:?Set OWNERS to the MC email(s) of the project owner}"
MODERATORS=${MODERATORS:-}
export AWS_REGION=$REGION AWS_PAGER=""

have=$(aws sts get-caller-identity --query Account --output text)
if [[ "$have" != "$ACCOUNT" ]]; then
  echo "The AWS CLI is signed in to account $have, not $ACCOUNT. Set AWS_PROFILE and try again." >&2
  exit 1
fi

ZIP=target/lambda/bootstrap/bootstrap.zip
[[ -f $ZIP ]] || { echo "No $ZIP: run make build first." >&2; exit 1; }

echo "== Table $TABLE (on demand)"
if ! aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name "$TABLE" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE"
fi
TABLE_ARN=$(aws dynamodb describe-table --table-name "$TABLE" --query Table.TableArn --output text)

echo "== Role $ROLE"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  NEW_ROLE=1
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name table --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"dynamodb:GetItem\",\"dynamodb:PutItem\",\"dynamodb:UpdateItem\",\"dynamodb:DeleteItem\",\"dynamodb:Query\",\"dynamodb:Scan\"],\"Resource\":\"$TABLE_ARN\"}]}"
ROLE_ARN=$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)
# A new role takes a few seconds before Lambda can use it.
[[ -n "${NEW_ROLE:-}" ]] && sleep 10

if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  SECRET=$(aws lambda get-function-configuration --function-name "$FN" --query Environment.Variables.NOTES_SECRET --output text)
  EXISTS=1
else
  SECRET=$(openssl rand -hex 32)
fi
ENV="{\"Variables\":{\"NOTES_TABLE\":\"$TABLE\",\"NOTES_SECRET\":\"$SECRET\",\"OWNERS\":\"$OWNERS\",\"MODERATORS\":\"$MODERATORS\"}}"

echo "== Function $FN"
if [[ -n "${EXISTS:-}" ]]; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$ZIP" >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" --environment "$ENV" >/dev/null
else
  aws lambda create-function --function-name "$FN" --runtime provided.al2023 --architectures arm64 \
    --handler bootstrap --zip-file "fileb://$ZIP" --role "$ROLE_ARN" --memory-size 128 --timeout 10 \
    --environment "$ENV" >/dev/null
fi
aws lambda wait function-updated --function-name "$FN"

echo "== Function URL"
if ! aws lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  # Requests are signed by each browser's key, so the URL itself is public.
  # The extension sends text/plain POSTs; CORS lets its pages read the answers.
  aws lambda create-function-url-config --function-name "$FN" --auth-type NONE \
    --cors 'AllowOrigins=*,AllowMethods=POST,AllowHeaders=content-type,MaxAge=86400' >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
  # Newer accounts also want InvokeFunction, limited to calls through the URL.
  aws lambda add-permission --function-name "$FN" --statement-id public-url-invoke \
    --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null 2>&1 || true
fi
URL=$(aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text)
echo
echo "Notes server: $URL"
echo "Paste it into Electric MC: side panel > Settings > Notes server."

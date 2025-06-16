TARGET_BUCKET="YOUR_BUCKET_HERE"
TARGET_PATH="s3://${TARGET_BUCKET}/"

aws s3 rm --recursive $TARGET_PATH

# List all multipart uploads (partials) in the specified bucket
UPLOADS=$(aws s3api list-multipart-uploads --bucket "${TARGET_BUCKET}" --query 'Uploads[].{Key:Key,UploadId:UploadId}' --output json)

if [ "$UPLOADS" == "null" ]; then
  echo "No partial multipart uploads found in bucket $TARGET_BUCKET."
  exit 0
fi

# Iterate through each multipart upload and abort it
echo "$UPLOADS" | jq -c '.[]' | while read -r UPLOAD; do
  KEY=$(echo "$UPLOAD" | jq -r '.Key')
  UPLOAD_ID=$(echo "$UPLOAD" | jq -r '.UploadId')

  echo "Aborting multipart upload for Key: $KEY, UploadId: $UPLOAD_ID"
  aws s3api abort-multipart-upload --bucket ""${TARGET_BUCKET}"" --key "$KEY" --upload-id "$UPLOAD_ID"
done


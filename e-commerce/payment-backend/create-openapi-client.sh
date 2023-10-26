docker run --rm \
  -v ${PWD}:/local openapitools/openapi-generator-cli generate \
  -i /local/src/openapi.yaml \
  -g typescript-node \
  -o /local/client

sudo chown -R $USER:$USER client
rm -rf ../payment-frontend/client
mv ./client ../payment-frontend
docker run --rm \
  -v ${PWD}:/local openapitools/openapi-generator-cli generate \
  -i /local/src/openapi.yaml \
  -g typescript-fetch \
  -o /local/client

sudo chown -R $USER:$USER client
rm -rf ../shop-frontend/client
mv ./client ../shop-frontend
# generate the openapi definition document
npx operon openapi src/operations.ts

# generate the typescript-node client
docker run --rm \
  -v ${PWD}:/local openapitools/openapi-generator-cli generate \
  -i /local/src/openapi.yaml \
  -g typescript-node \
  -o /local/client

# move the generated client to the frontend
sudo chown -R $USER:$USER client
rm -rf ../payment-frontend/client
mv ./client ../payment-frontend
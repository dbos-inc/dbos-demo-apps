:

# generate the openapi definition document
npx operon openapi src/operations.ts

# generate the typescript-fetch client
docker run --rm \
  -v ${PWD}:/local openapitools/openapi-generator-cli generate \
  -i /local/src/openapi.yaml \
  -g typescript-fetch \
  -o /local/client

# move the generated client to the frontend
sudo chown -R $USER:$USER client
rm -rf yky/app/components/client
mv ./client yky/app/components/client

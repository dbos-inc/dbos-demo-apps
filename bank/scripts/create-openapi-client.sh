bank_root=$(dirname $0)/..
cur_dir=$(pwd)

# generate the openapi definition document
cd $bank_root/bank-backend
npx operon openapi src/operations.ts
mv -f src/openapi.yaml ../bank-frontend

cd ../bank-frontend

# generate the typescript-fetch client
docker run --rm \
  -v ${PWD}:/local openapitools/openapi-generator-cli generate \
  -i /local/openapi.yaml \
  -g typescript-angular \
  -o /local/src/client

sudo chown -R $USER:$USER src/client

cd $cur_dir
bank_root=$(dirname $0)/..
cur_dir=$(pwd)

# generate the openapi definition document
cd $bank_root/bank-backend
npx operon openapi src/operations.ts

# temporarily append security info to end of openapi file
echo "  securitySchemes:" >> src/openapi.yaml
echo "    bearerAuth:" >> src/openapi.yaml
echo "      type: http" >> src/openapi.yaml
echo "      scheme: bearer" >> src/openapi.yaml
echo "security:" >> src/openapi.yaml
echo "  - bearerAuth: []" >> src/openapi.yaml

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
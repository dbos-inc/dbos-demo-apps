fe_dir=$(realpath $(dirname $0))
cur_dir=$(pwd)

# generate the openapi definition document
cd $fe_dir/../shop-backend
npx dbos-openapi generate src/operations.ts

cd $fe_dir
npx oazapfts ../shop-backend/src/openapi.yaml  ./lib/client.ts

cd $cur_dir

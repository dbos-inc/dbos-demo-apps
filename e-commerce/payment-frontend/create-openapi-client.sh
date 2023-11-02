fe_dir=$(realpath $(dirname $0))
cur_dir=$(pwd)

# generate the openapi definition document
cd $fe_dir/../payment-backend
npx operon openapi src/operations.ts

cd $fe_dir
npx oazapfts ../payment-backend/src/openapi.yaml  ./client.ts

cd $cur_dir
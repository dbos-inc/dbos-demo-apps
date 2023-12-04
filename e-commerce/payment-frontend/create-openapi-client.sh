fe_dir=$(realpath $(dirname $0))
cur_dir=$(pwd)

# generate the openapi definition document
cd $fe_dir/../payment-backend
npx dbos openapi src/operations.ts

cd $fe_dir
rm -rf client
npx openapi -i ../payment-backend/src/openapi.yaml -o client --name PaymentClient -c fetch

cd $cur_dir
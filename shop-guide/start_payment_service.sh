#!/bin/bash

PAYMENT_SERVICE_DIR="../e-commerce/payment-backend"

# Check the directory exists
if [ ! -d "$PAYMENT_SERVICE_DIR" ]; then
    echo "$PAYMENT_SERVICE_DIR not found. Are you running this script in shop-guide?"
    exit 1
fi

pushd $PAYMENT_SERVICE_DIR

npm i
npm run build
npx dbos-sdk start

popd

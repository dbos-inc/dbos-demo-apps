SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

npm install --prefix $SCRIPT_DIR/shop-backend
npm install --prefix $SCRIPT_DIR/shop-frontend
npm install --prefix $SCRIPT_DIR/payment-backend

#!/bin/bash

set -e

# Source environment variables
if [ ! -f .env.sh ]; then
    echo "Error: .env.sh file not found!"
    echo "Please copy .env.sh.example to .env.sh and update it with your values."
    exit 1
fi

source .env.sh

# Directory for generated manifests
MANIFESTS_DIR="manifests/generated"
TEMPLATES_DIR="manifests"

# Create generated manifests directory if it doesn't exist
mkdir -p "${MANIFESTS_DIR}"

echo "Generating Kubernetes manifests from templates..."

# Function to substitute environment variables in template files
# Works on both macOS and Linux
substitute_vars() {
    local template_file="$1"
    # Use perl for cross-platform compatibility (available on both macOS and Linux)
    perl -pe 's/\$\{(\w+)\}/$ENV{$1}/g' "$template_file"
}

# Generate manifests from templates
for template in "${TEMPLATES_DIR}"/*.yaml.template; do
    if [ -f "$template" ]; then
        filename=$(basename "$template" .template)
        output_file="${MANIFESTS_DIR}/${filename}"
        echo "  Generating ${output_file} from $(basename ${template})..."
        substitute_vars "$template" > "$output_file"
    fi
done

echo "Manifests generated successfully in ${MANIFESTS_DIR}/"

# Check if user wants to apply manifests
if [ "$1" == "--apply" ] || [ "$1" == "-a" ]; then
    echo ""
    echo "Applying manifests to Kubernetes cluster..."
    
    # Apply postgres first
    if [ -f "${MANIFESTS_DIR}/postgres.yaml" ]; then
        echo "  Applying postgres.yaml..."
        kubectl apply -f "${MANIFESTS_DIR}/postgres.yaml"
    fi
    
    # Then apply dbos app
    if [ -f "${MANIFESTS_DIR}/dbos.yaml" ]; then
        echo "  Applying dbos.yaml..."
        kubectl apply -f "${MANIFESTS_DIR}/dbos.yaml"
    fi
    
    # Finally apply KEDA scaled object
    if [ -f "${MANIFESTS_DIR}/dbos-keda-scaledobject.yaml" ]; then
        echo "  Applying dbos-keda-scaledobject.yaml..."
        kubectl apply -f "${MANIFESTS_DIR}/dbos-keda-scaledobject.yaml"
    fi
    
    echo ""
    echo "Deployment complete!"
else
    echo ""
    echo "To apply these manifests to your cluster, run:"
    echo "  $0 --apply"
    echo ""
    echo "Or apply manually:"
    echo "  kubectl apply -f ${MANIFESTS_DIR}/"
fi


#!/bin/bash

# Source environment variables
if [ ! -f .env.sh ]; then
    echo "Error: .env.sh file not found!"
    echo "Please copy .env.sh.example to .env.sh and update it with your values."
    exit 1
fi

source .env.sh

# Get the image tag (default to IMAGE_TAG from .env.sh if not provided)
TAG=${1:-${IMAGE_TAG}}
FULL_IMAGE_NAME="${ECR_REPO}:${IMAGE_NAME}-${TAG}"

echo "Building Docker image..."
docker build -t ${IMAGE_NAME}:${TAG} .

if [ $? -ne 0 ]; then
    echo "Docker build failed!"
    exit 1
fi

echo "Tagging image for ECR..."
docker tag ${IMAGE_NAME}:${TAG} ${FULL_IMAGE_NAME}

echo "Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPO}

if [ $? -ne 0 ]; then
    echo "ECR login failed! Make sure you have AWS credentials configured."
    exit 1
fi

echo "Pushing image to ECR..."
docker push ${FULL_IMAGE_NAME}

if [ $? -ne 0 ]; then
    echo "Docker push failed!"
    exit 1
fi

echo "Successfully pushed ${FULL_IMAGE_NAME}"


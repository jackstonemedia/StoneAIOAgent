#!/bin/bash
echo "Building Stone AIO Frontend..."
npm run build

echo "Deploying to Firebase..."
firebase deploy

echo "Deployment complete."

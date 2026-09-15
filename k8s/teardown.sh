#!/bin/bash
# Run this after a demo session to stop GKE billing.
# Cluster can be re-created with:
#   gcloud container clusters create-auto quoteiq-cluster --region europe-west2
set -e

echo "Deleting GKE Autopilot cluster quoteiq-cluster in europe-west2..."
gcloud container clusters delete quoteiq-cluster \
  --region europe-west2 \
  --project newagent-88d6a \
  --quiet

echo "Done. No cluster running — no compute charges."

#!/bin/bash

# MuzeBIZ.Lab Deployment Script

echo "🚀 Starting MuzeBIZ.Lab Deployment..."

# 1. Build Frontend
echo "📦 Building frontend..."
npm run build

# 2. Deploy Supabase Functions
echo "⚡ Deploying Supabase Edge Functions..."
PROJECT_REF="drnxydtrsjumjksqmdgi"
npx supabase functions deploy --project-ref $PROJECT_REF get-stock-quote --use-api
npx supabase functions deploy --project-ref $PROJECT_REF analyze-stock --use-api
npx supabase functions deploy --project-ref $PROJECT_REF update-market-context --use-api
npx supabase functions deploy --project-ref $PROJECT_REF get-market-scanner --use-api
npx supabase functions deploy --project-ref $PROJECT_REF get-yahoo-quote --use-api
npx supabase functions deploy --project-ref $PROJECT_REF smart-quote --use-api
npx supabase functions deploy --project-ref $PROJECT_REF execute-trades --use-api
npx supabase functions deploy --project-ref $PROJECT_REF monitor-positions --use-api
npx supabase functions deploy --project-ref $PROJECT_REF run-backtest --use-api
npx supabase functions deploy --project-ref $PROJECT_REF run-quant-portfolio --use-api
npx supabase functions deploy --project-ref $PROJECT_REF run-quant-scanner --use-api
npx supabase functions deploy --project-ref $PROJECT_REF grade-predictions --use-api

# 3. Apply DB Migrations
echo "💾 Pushing database changes..."
npx supabase db push

# 4. (Optional) Run Initial Hunter Bot
# echo "🎯 Running initial Finviz Hunter Bot..."
# export SUPABASE_URL="https://$PROJECT_REF.supabase.co"
# # Note: SUPABASE_SERVICE_ROLE_KEY must be set in your terminal environment
# npx ts-node scripts/finviz-hunter.ts

echo "✅ All components deployed successfully!"

#!/bin/bash

# MuzeBIZ.Lab Deployment Script

echo "🚀 Starting MuzeBIZ.Lab Deployment..."

# 1. Build Frontend
echo "📦 Building frontend..."
npm run build

# 2. Deploy Supabase Functions
echo "⚡ Deploying Supabase Edge Functions..."
PROJECT_REF="drnxydtrsjumjksqmdgi"
npx supabase functions deploy --project-ref $PROJECT_REF get-stock-quote
npx supabase functions deploy --project-ref $PROJECT_REF analyze-stock
npx supabase functions deploy --project-ref $PROJECT_REF update-market-context
npx supabase functions deploy --project-ref $PROJECT_REF get-market-scanner
npx supabase functions deploy --project-ref $PROJECT_REF get-yahoo-quote
npx supabase functions deploy --project-ref $PROJECT_REF smart-quote
npx supabase functions deploy --project-ref $PROJECT_REF execute-trades
npx supabase functions deploy --project-ref $PROJECT_REF monitor-positions
npx supabase functions deploy --project-ref $PROJECT_REF run-backtest
npx supabase functions deploy --project-ref $PROJECT_REF run-quant-portfolio
npx supabase functions deploy --project-ref $PROJECT_REF run-quant-scanner
npx supabase functions deploy --project-ref $PROJECT_REF grade-predictions

# 3. Apply DB Migrations
echo "💾 Pushing database changes..."
npx supabase db push

# 4. (Optional) Run Initial Hunter Bot
# echo "🎯 Running initial Finviz Hunter Bot..."
# export SUPABASE_URL="https://$PROJECT_REF.supabase.co"
# # Note: SUPABASE_SERVICE_ROLE_KEY must be set in your terminal environment
# npx ts-node scripts/finviz-hunter.ts

echo "✅ All components deployed successfully!"

# MyAiPlug Unified API (MVP)

Minimal gateway wrapping an OpenAI model as a unified marketplace backend.

## Endpoints
- GET /v1/models
- GET /v1/models/{id}/metrics
- POST /v1/models/{id}/invoke
- GET /health

## Run Locally
```powershell
$env:OPENAI_API_KEY="sk-..."; $env:DEMO_API_KEY="demo-key-123"; $env:AUTH_SECRET="REPLACE_WITH_STRONG_SECRET"
python -m uvicorn main:app --reload --port 8080
```

## Docker Build & Run
```powershell
docker build -t myaiplug-gateway .
docker run -p 8080:8080 -e OPENAI_API_KEY=sk-... myaiplug-gateway
```

## Deploy to Cloud Run (example)
```powershell
gcloud builds submit --tag gcr.io/PROJECT_ID/myaiplug-gateway:v1
gcloud run deploy myaiplug-gateway --image gcr.io/PROJECT_ID/myaiplug-gateway:v1 --platform managed --region us-central1 --allow-unauthenticated --set-env-vars OPENAI_API_KEY=sk-...,DEMO_API_KEY=demo-key-123
```

## models.json
Extend this file to add more models with different providers later.

## Next Steps
- Add provider adapters (Vertex, Hugging Face).
- Persist usage in a database.
- Implement rate limiting & billing aggregation.

## Security & Deployment Runbook

See `backend/SECURITY_AND_DEPLOYMENT_RUNBOOK.md` for detailed instructions on secrets, recovery, and production deployment procedures. The backend will refuse to start if `AUTH_SECRET` is not set or left at the insecure default.

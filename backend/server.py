import asyncio
import logging
import os
from fastapi import FastAPI, APIRouter, WebSocket
from starlette.middleware.cors import CORSMiddleware

from db import client as mongo_client
from routes import telephony, calls, personas, campaigns, crm, knowledge, custom_tools, settings_routes, dashboard
from services.gemini_bridge import handle_telephony_stream, handle_browser_stream
from services.campaign_runner import campaign_loop
from seed import seed

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="VoxFlow - AI Calling Platform")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "VoxFlow AI Calling Platform", "status": "ok"}


for r in [telephony.router, calls.router, personas.router, campaigns.router, crm.router,
          knowledge.router, custom_tools.router, settings_routes.router, dashboard.router]:
    api.include_router(r)

app.include_router(api)


@app.websocket("/api/telephony/stream")
async def telephony_stream(ws: WebSocket):
    await handle_telephony_stream(ws)


@app.websocket("/api/browser/stream")
async def browser_stream(ws: WebSocket):
    await handle_browser_stream(ws)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed()
    asyncio.create_task(campaign_loop())
    logger.info("VoxFlow backend started")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()

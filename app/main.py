from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.instances import router as instances_router
from app.api.sessions import router as sessions_router
from app.api.settings import router as settings_router
from app.api.stats import router as stats_router
from app.api.tasks import router as tasks_router
from app.db.init_db import init_db

app = FastAPI(title='Routine Bot API', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router, prefix='/api')
app.include_router(tasks_router, prefix='/api')
app.include_router(settings_router, prefix='/api')
app.include_router(sessions_router, prefix='/api')
app.include_router(instances_router, prefix='/api')
app.include_router(stats_router, prefix='/api')
app.include_router(dashboard_router, prefix='/api')

app.mount('/static', StaticFiles(directory='app/static'), name='static')


@app.on_event('startup')
def on_startup() -> None:
    init_db()


@app.get('/')
def webapp_index():
    return FileResponse('app/static/index.html')

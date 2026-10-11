from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import errors
from app.config import get_settings, validate_runtime_settings
from app.routers import ai, auth, billing, catalogue, ebill, group_buys, health, search, shop

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_runtime_settings(get_settings())
    yield


app = FastAPI(title="KadaNet API", version="0.1.0", lifespan=lifespan)
errors.install(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    # Lovable previews live on changing subdomains
    allow_origin_regex=r"https://.*\.(lovable\.app|lovableproject\.com)",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(catalogue.router, prefix=API_PREFIX)
app.include_router(shop.router, prefix=API_PREFIX)
app.include_router(billing.router, prefix=API_PREFIX)
app.include_router(ai.router, prefix=API_PREFIX)
app.include_router(search.router, prefix=API_PREFIX)
app.include_router(ebill.api_router, prefix=API_PREFIX)
app.include_router(ebill.page_router)
app.include_router(group_buys.supplier_router, prefix=API_PREFIX)
app.include_router(group_buys.retailer_router, prefix=API_PREFIX)

# Add routers here, matching docs/openapi.yaml:
#   auth, shop, catalogue, billing, sync  (issues #11-#18, #37, #38, #44)
#   search, ebill, ai                     (issues #20-#22, #25, #26, #41)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import errors
from app.config import get_settings
from app.routers import health

API_PREFIX = "/api/v1"

app = FastAPI(title="KadaNet API", version="0.1.0")
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

# Add routers here, matching docs/openapi.yaml:
#   auth, shop, catalogue, billing, sync  (issues #11-#18, #37, #38, #44)
#   search, ebill, ai                     (issues #20-#22, #25, #26, #41)

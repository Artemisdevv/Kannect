from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "change-me"
LOCAL_ENVIRONMENTS = {"local", "development"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://kadanet:kadanet@localhost:5432/kadanet"
    # Production-safe default: local development must opt in through APP_ENV=local.
    app_env: str = "production"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_expire_minutes: int = Field(default=60 * 24 * 7, ge=1)
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    demo_otp: str = "123456"
    public_base_url: str = "http://localhost:8000"
    anthropic_api_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_runtime_settings(settings: Settings) -> None:
    """Reject the scaffold JWT secret outside local development."""
    if (
        settings.app_env.strip().lower() not in LOCAL_ENVIRONMENTS
        and settings.jwt_secret == DEFAULT_JWT_SECRET
    ):
        raise RuntimeError(
            "JWT_SECRET must be set to a non-default value outside local development"
        )

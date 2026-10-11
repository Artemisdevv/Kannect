from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "change-me"
LOCAL_ENVIRONMENTS = {"local", "development"}


NATIVE_APP_ORIGINS = ("https://localhost", "http://localhost", "capacitor://localhost")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://kadanet:kadanet@localhost:5432/kadanet"
    # Production-safe default: local development must opt in through APP_ENV=local.
    app_env: str = "production"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_expire_minutes: int = Field(default=60 * 24 * 7, ge=1)
    cors_origins: str = (
        "http://localhost:5173,http://localhost:8080,https://localhost,http://localhost,capacitor://localhost"
    )  # the last three are the Android app (Capacitor) origins
    demo_otp: str = "123456"
    # How phone numbers are verified. "demo": the fixed demo OTP (hackathon default). "phone_email":
    # real verification through phone.email (https://www.phone.email), 1000 free SMS a month in
    # India for the first 6 months, then paid. In that mode the demo OTP only works for the
    # fictional demo numbers listed below, so the demo shops stay loginable but real numbers
    # cannot be taken over with the demo OTP.
    otp_provider: Literal["demo", "phone_email"] = "demo"
    phone_email_client_id: str = ""  # public id from the phone.email dashboard (the app needs it)
    # Domains we will fetch a verification result from (the domain and its subdomains, https only).
    phone_email_hosts: str = "phone.email"
    # The exact seeded demo numbers (8 retailers, 3 suppliers) that may still use the demo OTP in
    # phone_email mode. An explicit list, not a prefix: a prefix would cover real numbers too. Set
    # DEMO_PHONES to an empty value before a real pilot to switch the demo logins off completely.
    demo_phones: str = (
        "+919000000001,+919000000002,+919000000003,+919000000004,+919000000005,"
        "+919000000006,+919000000007,+919000000008,+919000000101,+919000000102,+919000000103"
    )
    public_base_url: str = "http://localhost:8000"
    llm_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"

    @property
    def demo_phone_set(self) -> frozenset[str]:
        return frozenset(p.strip() for p in self.demo_phones.split(",") if p.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        configured = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # The Android apps (Capacitor WebView) always call from these origins. They carry a bearer
        # token, not cookies, so allowing them is safe, and it must not depend on a deploy setting.
        return [*configured, *(o for o in NATIVE_APP_ORIGINS if o not in configured)]


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

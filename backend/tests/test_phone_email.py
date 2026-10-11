# ruff: noqa: E501
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.auth import is_e164_phone
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import OwnerIdentity
from app.routers import auth
from app.routers.auth import (
    check_result_url,
    config_router,
    get_phone_email_fetcher,
    phone_from_result,
    router,
)

GOOD = "https://user.phone.email/user_abcxd123fgbfg43454.json"


def settings(**kw):
    return Settings(_env_file=None, app_env="test", jwt_secret="phone-email-test", **kw)


class Session:
    def __init__(self):
        self.identities = {}

    def get(self, model, key):
        return self.identities.get(key) if model is OwnerIdentity else None

    def scalar(self, statement):
        return None

    def add(self, value):
        self.identities[value.phone] = value

    def commit(self):
        pass

    def rollback(self):
        pass


def client(cfg, fetched=None, calls=None):
    app = FastAPI()
    install(app)
    app.include_router(router)
    app.include_router(config_router)
    session = Session()
    app.dependency_overrides[get_db] = lambda: session

    def fetcher(url):
        if calls is not None:
            calls.append(url)
        if isinstance(fetched, Exception):
            raise fetched
        return fetched

    app.dependency_overrides[get_settings] = lambda: cfg
    app.dependency_overrides[get_phone_email_fetcher] = lambda: fetcher
    return TestClient(app)


@pytest.fixture(autouse=True)
def fresh_used():
    auth._used.clear()


ON = {"otp_provider": "phone_email", "phone_email_client_id": "CLIENT123"}
RESULT = {"user_country_code": "+91", "user_phone_number": "9876543210", "user_first_name": "A"}


def test_default_is_the_demo_flow_and_config_says_so():
    c = client(settings())
    assert c.get("/auth/config").json() == {"otp_provider": "demo", "phone_email_client_id": None}
    ok = c.post("/auth/otp/verify", json={"phone": "+919876543210", "otp": "123456", "role": "retailer"})
    assert ok.status_code == 200


def test_config_exposes_the_client_id_only_when_enabled():
    assert client(settings(**ON)).get("/auth/config").json() == {
        "otp_provider": "phone_email", "phone_email_client_id": "CLIENT123"}  # fmt: skip


def test_flag_off_rejects_phone_email_login():
    r = client(settings()).post("/auth/phone-email/verify", json={"user_json_url": GOOD})
    assert r.status_code == 400


def test_demo_otp_no_longer_logs_in_real_numbers_when_enabled():
    c = client(settings(**ON))
    real = c.post("/auth/otp/verify", json={"phone": "+919876543210", "otp": "123456"})
    assert real.status_code == 401
    demo = c.post("/auth/otp/verify", json={"phone": "+919000000002", "otp": "123456"})
    assert demo.status_code == 200  # the fictional demo shops still work


def test_verified_number_logs_in_and_a_second_use_is_refused():
    calls = []
    c = client(settings(**ON), RESULT, calls)
    r = c.post("/auth/phone-email/verify", json={"user_json_url": GOOD, "role": "retailer"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "retailer" and r.json()["token"] and r.json()["shop"] is None
    assert calls == [GOOD]
    again = c.post("/auth/phone-email/verify", json={"user_json_url": GOOD})
    assert again.status_code == 401 and len(calls) == 1


def test_provider_error_is_a_clean_401():
    c = client(settings(**ON), HTTPException(status_code=401, detail="Could not confirm the phone verification"))
    assert c.post("/auth/phone-email/verify", json={"user_json_url": GOOD}).status_code == 401


@pytest.mark.parametrize(
    "url",
    [
        "http://user.phone.email/user_abcxd123fgbfg43454.json",  # not https
        "https://evil.example.com/user_abcxd123fgbfg43454.json",  # wrong host
        "https://user.phone.email.evil.com/user_abcxd123fgbfg43454.json",  # look-alike host
        "https://user.phone.email@evil.com/user_abcxd123fgbfg43454.json",  # userinfo trick
        "https://user.phone.email:8443/user_abcxd123fgbfg43454.json",  # odd port
        "https://user.phone.email/user_abcxd123fgbfg43454.json?x=1",  # query
        "https://user.phone.email/../etc/passwd.json",  # path games
        "https://user.phone.email/a.json",  # too short
        "http://127.0.0.1/user_abcxd123fgbfg43454.json",
        "file:///etc/passwd",
        "",
    ],
)
def test_untrusted_result_urls_are_never_fetched(url):
    calls = []
    c = client(settings(**ON), RESULT, calls)
    assert c.post("/auth/phone-email/verify", json={"user_json_url": url}).status_code == 400
    assert calls == []
    with pytest.raises(HTTPException):
        check_result_url(url, settings(**ON))


def test_good_url_is_normalised():
    assert check_result_url(GOOD + " ", settings(**ON)) == GOOD


@pytest.mark.parametrize(
    "data,phone",
    [
        ({"user_country_code": "+91", "user_phone_number": "9876543210"}, "+919876543210"),
        ({"user_country_code": "91", "user_phone_number": "98765 43210"}, "+919876543210"),
        ({"user_country_code": "+1", "user_phone_number": "2025550123"}, "+12025550123"),
    ],
)
def test_phone_from_result(data, phone):
    assert phone_from_result(data) == phone and is_e164_phone(phone)


@pytest.mark.parametrize(
    "data", [{}, {"user_country_code": "+91"}, {"user_phone_number": "98"}, {"user_country_code": "x", "user_phone_number": "9876543210"}]
)
def test_unusable_results_are_rejected(data):
    with pytest.raises(HTTPException):
        phone_from_result(data)


def test_role_rules_still_apply():
    c = client(settings(**ON), RESULT)
    c.post("/auth/phone-email/verify", json={"user_json_url": GOOD, "role": "supplier"})
    second = "https://user.phone.email/user_second123456.json"
    r = c.post("/auth/phone-email/verify", json={"user_json_url": second, "role": "retailer"})
    assert r.status_code == 401  # same phone, other role


def test_demo_otp_is_an_exact_list_not_a_number_range():
    c = client(settings(**ON))
    # inside the old +91900000 prefix, but not one of the seeded demo numbers
    near = c.post("/auth/otp/verify", json={"phone": "+919000012345", "otp": "123456"})
    assert near.status_code == 401
    assert c.post("/auth/otp/verify", json={"phone": "+919000000101", "otp": "123456", "role": "supplier"}).status_code == 200


def test_empty_demo_list_switches_demo_logins_off():
    c = client(settings(**ON, demo_phones=""))
    assert c.post("/auth/otp/verify", json={"phone": "+919000000002", "otp": "123456"}).status_code == 401

from app.config import Settings


def test_android_app_origins_are_always_allowed():
    s = Settings(_env_file=None, cors_origins="https://shop.example.com")
    assert "https://shop.example.com" in s.cors_origin_list
    for origin in ("https://localhost", "http://localhost", "capacitor://localhost"):
        assert origin in s.cors_origin_list


def test_no_duplicates_when_already_configured():
    s = Settings(_env_file=None, cors_origins="https://localhost,http://localhost:5173")
    assert s.cors_origin_list.count("https://localhost") == 1

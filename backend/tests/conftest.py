"""Keep unit tests independent of a developer's local backend/.env.

Settings reads backend/.env, so a machine configured for real phone verification
(OTP_PROVIDER=phone_email) would otherwise change how the demo-OTP tests behave. Environment
variables beat the .env file, so pin the defaults the tests expect before the app is imported.
"""

import os

os.environ["OTP_PROVIDER"] = "demo"
os.environ["PHONE_EMAIL_CLIENT_ID"] = ""
os.environ.pop("DEMO_PHONES", None)

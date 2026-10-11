"""Error shape from docs/api-contract.md: {"error": {"code": ..., "message": ...}}."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_CODES = {400: "invalid_request", 401: "unauthorized", 404: "not_found", 409: "conflict"}


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def install(app: FastAPI) -> None:
    # Starlette's HTTPException also covers unknown routes (404), FastAPI's subclasses it.
    @app.exception_handler(StarletteHTTPException)
    async def http_exc(_: Request, exc: HTTPException):
        code = _CODES.get(exc.status_code, "internal")
        return JSONResponse(
            _body(code, str(exc.detail)), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exc(_: Request, exc: RequestValidationError):
        return JSONResponse(_body("invalid_request", str(exc.errors())), status_code=400)

"""HTTP-level tests for the FastAPI app (mock LLM, temp SQLite)."""
import base64
import struct
import zlib

import pytest
from fastapi.testclient import TestClient

from app.main import app


def _png() -> bytes:
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b""))


PNG_B64 = base64.b64encode(_png()).decode()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert "database" in r.json()


def test_text_gambling_flagged_without_llm(client):
    r = client.post("/analyze-text", json={"text": "Kèo bóng 88 – nhà cái uy tín, thắng lớn"})
    body = r.json()
    assert r.status_code == 200
    assert body["label"] == "GAMBLING_AD" and body["llmCalled"] is False


def test_text_benign(client):
    r = client.post("/analyze-text", json={"text": "The city council approved the new park budget today."})
    assert r.json()["label"] == "BENIGN"


def test_text_allowlist(client):
    r = client.post("/analyze-text", json={"text": "nhà cái fb88", "url": "https://news.example.com/a",
                                            "allowlist": ["example.com"]})
    assert r.json()["label"] == "BENIGN"


def test_image_without_ocr_still_analysed(client):
    r = client.post("/analyze-image", json={"imageBase64": PNG_B64, "ocrText": ""})
    assert r.status_code == 200 and r.json()["llmCalled"] is True


def test_image_data_url_accepted(client):
    r = client.post("/analyze-image", json={"imageBase64": "data:image/png;base64," + PNG_B64,
                                             "ocrText": "Kèo bóng 88 - nhà cái"})
    assert r.json()["label"] == "GAMBLING_AD"


def test_image_empty_rejected(client):
    assert client.post("/analyze-image", json={"imageBase64": "", "ocrText": ""}).status_code == 400


def test_image_bad_base64_rejected(client):
    assert client.post("/analyze-image", json={"imageBase64": "not base64!!"}).status_code == 400


def test_image_wrong_mime_rejected(client):
    r = client.post("/analyze-image", json={"imageBase64": "data:text/html;base64," + PNG_B64})
    assert r.status_code == 415


def test_lang_param(client):
    vi = client.post("/analyze-text", json={"text": "nhà cái fb88 uy tín"}).json()
    en = client.post("/analyze-text", json={"text": "nhà cái fb88 uy tín", "lang": "en"}).json()
    assert "cờ bạc" in vi["rationale"] or "Gambling" in vi["rationale"] or "cá cược" in vi["rationale"]
    assert "Gambling" in en["rationale"] or "cờ bạc" in en["rationale"]
    assert client.post("/analyze-text", json={"text": "x", "lang": "fr"}).status_code == 422

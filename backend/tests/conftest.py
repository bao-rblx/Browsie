import os
import tempfile

# Isolate tests: temp SQLite DB, mock LLM, no auth. Must run before `app` is imported.
_tmp = tempfile.mkdtemp(prefix="browsie-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_tmp, "test.db").replace("\\", "/")
os.environ["LLM_PROVIDER"] = "mock"
os.environ["BROWSIE_API_TOKEN"] = ""
os.environ["GEMINI_API_KEY"] = ""

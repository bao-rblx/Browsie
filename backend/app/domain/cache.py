"""TTL cache for verdicts (BR-06). Clock is injectable so tests don't sleep."""
from __future__ import annotations

import threading
import time
from typing import Callable, Optional

from .models import SourceType, Verdict

TTL_SECONDS = {
    SourceType.TEXT: 10 * 60,   # 10 min
    SourceType.IMAGE: 30 * 60,  # 30 min
}


class VerdictCache:
    def __init__(self, clock: Callable[[], float] = time.monotonic, max_entries: int = 5000) -> None:
        self._clock = clock
        self._max = max_entries
        self._data: dict[str, tuple[float, Verdict]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Verdict]:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, verdict = item
            if self._clock() >= expires_at:
                del self._data[key]
                return None
            return verdict

    def put(self, key: str, verdict: Verdict, source_type: SourceType) -> None:
        with self._lock:
            if len(self._data) >= self._max:
                # drop the entry closest to expiry
                oldest = min(self._data, key=lambda k: self._data[k][0])
                del self._data[oldest]
            self._data[key] = (self._clock() + TTL_SECONDS[source_type], verdict)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        return len(self._data)

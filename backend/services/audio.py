import base64
import wave
import numpy as np


def resample_pcm(pcm: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate or len(pcm) == 0:
        return pcm
    dst_len = int(len(pcm) * dst_rate / src_rate)
    x_src = np.linspace(0, 1, len(pcm), endpoint=False)
    x_dst = np.linspace(0, 1, dst_len, endpoint=False)
    out = np.interp(x_dst, x_src, pcm.astype(np.float32))
    return np.clip(out, -32768, 32767).astype(np.int16)


def b64_to_pcm(payload: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(payload), dtype="<i2")


def pcm_to_b64(pcm: np.ndarray) -> str:
    return base64.b64encode(pcm.astype("<i2").tobytes()).decode()


class CallRecorder:
    """Collects timestamped 16kHz PCM chunks from both parties, mixes and writes WAV."""

    def __init__(self):
        self.chunks = []  # (timestamp_ms, np.int16 array)

    def add(self, ts_ms: float, pcm: np.ndarray):
        if len(pcm) > 0:
            self.chunks.append((ts_ms, pcm))

    def write_wav(self, path: str, start_ms: float) -> bool:
        if not self.chunks:
            return False
        max_len = 0
        placed = []
        for ts, pcm in self.chunks:
            offset = max(0, int((ts - start_ms) * 16))
            placed.append((offset, pcm))
            max_len = max(max_len, offset + len(pcm))
        if max_len == 0 or max_len > 16000 * 60 * 60:
            return False
        buf = np.zeros(max_len, dtype=np.int32)
        for offset, pcm in placed:
            buf[offset:offset + len(pcm)] += pcm.astype(np.int32)
        mixed = np.clip(buf, -32768, 32767).astype(np.int16)
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(mixed.tobytes())
        return True

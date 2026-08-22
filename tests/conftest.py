import os
from pathlib import Path

from gltest.direct import loader
from gltest.direct.vm import VMContext


CONTRACT_PATH = str(
    Path(__file__).resolve().parents[1] / "contracts" / "releaseproof.py"
)


if os.name == "nt":
    _original_inject_message = loader._inject_message_to_fd0
    _original_cleanup = VMContext._cleanup_after_deactivate

    def _windows_safe_inject_message(vm):
        try:
            _original_inject_message(vm)
        except PermissionError as error:
            vm._stdin_temp_path = error.filename

    def _windows_safe_cleanup(self):
        _original_cleanup(self)
        temp_path = getattr(self, "_stdin_temp_path", None)
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
            self._stdin_temp_path = None

    loader._inject_message_to_fd0 = _windows_safe_inject_message
    VMContext._cleanup_after_deactivate = _windows_safe_cleanup


_original_warp = VMContext.warp


def _refresh_datetime_on_warp(self, timestamp):
    """Mirror the per-transaction message refresh used by the real runtime."""
    _original_warp(self, timestamp)
    try:
        from genlayer import gl

        if gl.message_raw is not None:
            gl.message_raw["datetime"] = timestamp
    except ImportError:
        pass


VMContext.warp = _refresh_datetime_on_warp

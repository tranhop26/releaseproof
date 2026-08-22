"""Start GLSim with the genlayer-test 0.29.2 Windows fd-0 workaround."""

import os
from pathlib import Path

from gltest.direct import loader
from gltest.direct.vm import VMContext


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


from glsim.__main__ import main


if __name__ == "__main__":
    main()

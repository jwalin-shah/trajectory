"""Exceptions raised by the Python wrapper."""

from ._types import NormalizationErrorCode


class TrajectoryRuntimeError(RuntimeError):
    """The bundled trajectory runtime could not be executed reliably."""


class NodeUnavailableError(TrajectoryRuntimeError):
    """Node.js 20 or newer could not be found."""


class NormalizationError(ValueError):
    """A transcript could not be normalized."""

    def __init__(
        self, code: NormalizationErrorCode, message: str, *, input_index: int = 0
    ) -> None:
        super().__init__(message)
        self.code = code
        self.input_index = input_index

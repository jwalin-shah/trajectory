"""Normalize native agent transcripts using the canonical trajectory runtime."""

from ._client import normalize_many, normalize_transcript
from ._errors import NodeUnavailableError, NormalizationError, TrajectoryRuntimeError
from ._types import (
    AssistantMessageRecord,
    AssistantToolCallRecord,
    Diagnostic,
    DiagnosticCode,
    MetaRecord,
    NormalizationBounds,
    NormalizationErrorCode,
    NormalizedRecord,
    NormalizeInput,
    NormalizeResult,
    ReasoningRecord,
    ToolCall,
    ToolArgumentBounds,
    ToolResultBounds,
    ToolResultRecord,
    ToolResultTruncationStrategy,
    TrajectorySource,
    UserRecord,
)

__all__ = [
    "AssistantMessageRecord",
    "AssistantToolCallRecord",
    "Diagnostic",
    "DiagnosticCode",
    "MetaRecord",
    "NodeUnavailableError",
    "NormalizationBounds",
    "NormalizationError",
    "NormalizationErrorCode",
    "NormalizedRecord",
    "NormalizeInput",
    "NormalizeResult",
    "ReasoningRecord",
    "ToolCall",
    "ToolArgumentBounds",
    "ToolResultBounds",
    "ToolResultRecord",
    "ToolResultTruncationStrategy",
    "TrajectoryRuntimeError",
    "TrajectorySource",
    "UserRecord",
    "normalize_many",
    "normalize_transcript",
]

__version__ = "0.1.0"

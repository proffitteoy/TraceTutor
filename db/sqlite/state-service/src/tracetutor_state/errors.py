class StateServiceError(Exception):
    """Base domain exception."""


class NotFoundError(StateServiceError):
    """Requested aggregate does not exist."""


class ConflictError(StateServiceError):
    """Operation conflicts with existing state."""


class DomainValidationError(StateServiceError):
    """The request violates a state or evidence rule."""

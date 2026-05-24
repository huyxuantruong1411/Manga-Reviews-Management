from typing import Annotated, Any
from bson import ObjectId
from pydantic import BeforeValidator, WithJsonSchema

# Custom type for handling MongoDB ObjectIds in Pydantic v2.
# It converts ObjectIds to strings during validation, so that the fields are stored
# as regular strings in Python, preventing any serialization errors when outputting JSON.
PyObjectId = Annotated[
    str,
    BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) or ObjectId.is_valid(v) else v),
    WithJsonSchema({"type": "string"})
]

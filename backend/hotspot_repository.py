"""Read hotspot snapshots from DynamoDB when configured."""

import logging
import os
from dataclasses import dataclass
from typing import Any, Callable, Mapping

from botocore.exceptions import BotoCoreError, ClientError


logger = logging.getLogger(__name__)


class HotspotConfigurationError(ValueError):
    """Raised when hotspot storage configuration is invalid."""


class HotspotRepositoryError(RuntimeError):
    """Raised when DynamoDB cannot provide hotspot records."""


@dataclass(frozen=True)
class HotspotRepositoryConfig:
    table_name: str | None
    region_name: str | None
    demo_fallback: bool

    @classmethod
    def from_env(
        cls,
        environ: Mapping[str, str] | None = None,
    ) -> "HotspotRepositoryConfig":
        values = os.environ if environ is None else environ
        fallback_value = values.get("HOTSPOTS_DEMO_FALLBACK", "true")
        normalized_fallback = fallback_value.strip().lower()

        if normalized_fallback not in {"true", "false", "1", "0", "yes", "no"}:
            raise HotspotConfigurationError(
                "HOTSPOTS_DEMO_FALLBACK must be a boolean value."
            )

        table_name = values.get("DYNAMODB_HOTSPOTS_TABLE", "").strip()
        region_name = (
            values.get("AWS_REGION", "").strip()
            or values.get("AWS_DEFAULT_REGION", "").strip()
            or None
        )

        return cls(
            table_name=table_name or None,
            region_name=region_name,
            demo_fallback=normalized_fallback in {"true", "1", "yes"},
        )


class DynamoDBHotspotRepository:
    def __init__(
        self,
        config: HotspotRepositoryConfig,
        resource_factory: Callable[..., Any] | None = None,
    ) -> None:
        self.config = config
        self._resource_factory = resource_factory

    def list_for_location(self, location_id: str) -> list[dict[str, Any]]:
        if not self.config.table_name:
            raise HotspotConfigurationError(
                "DYNAMODB_HOTSPOTS_TABLE is not configured."
            )

        try:
            table = self._get_table()
            from boto3.dynamodb.conditions import Key

            query_args: dict[str, Any] = {
                "KeyConditionExpression": Key("location_id").eq(location_id),
            }
            records: list[dict[str, Any]] = []

            while True:
                response = table.query(**query_args)
                records.extend(response.get("Items", []))
                last_key = response.get("LastEvaluatedKey")
                if not last_key:
                    return records
                query_args["ExclusiveStartKey"] = last_key
        except ClientError as error:
            error_code = error.response.get("Error", {}).get("Code", "ClientError")
            logger.error("DynamoDB hotspot query failed (aws_error=%s)", error_code)
            raise HotspotRepositoryError(
                "Could not load hotspots from DynamoDB."
            ) from None
        except BotoCoreError as error:
            logger.error(
                "DynamoDB hotspot query failed (%s)",
                type(error).__name__,
            )
            raise HotspotRepositoryError(
                "Could not load hotspots from DynamoDB."
            ) from None

    def _get_table(self) -> Any:
        resource_factory = self._resource_factory
        if resource_factory is None:
            import boto3

            resource_factory = boto3.resource

        options = (
            {"region_name": self.config.region_name}
            if self.config.region_name
            else {}
        )
        resource = resource_factory("dynamodb", **options)
        return resource.Table(self.config.table_name)
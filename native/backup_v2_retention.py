"""S02 retained-file eligibility, reused I15 14-successful-copy semantics.

A file is a successful v2 archive only after tracked native disk authentication
AND protected source/donor recovery preparation. This module never chooses paths
from browser messages and does not make filesystem changes itself.
"""
import re
from pathlib import Path

RETAIN_SUCCESSFUL = 14
RUN_ID = re.compile(r"^s02_[a-f0-9]{32}$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")


def qualified(record):
    return (type(record) is dict and record.get("schema") == 1 and
            record.get("state") == "RECOVERY_VERIFIED" and
            isinstance(record.get("runId"), str) and
            RUN_ID.fullmatch(record["runId"]) is not None and
            isinstance(record.get("ciphertextSha256"), str) and
            SHA256.fullmatch(record["ciphertextSha256"]) is not None and
            isinstance(record.get("preparedSha256"), str) and
            SHA256.fullmatch(record["preparedSha256"]) is not None and
            type(record.get("verifiedAtNs")) is int and
            record["verifiedAtNs"] > 0)


def eligible_for_prune(records, keep=RETAIN_SUCCESSFUL):
    """Pure, deterministic; never mistake encrypted inventory for recovery."""
    if keep != RETAIN_SUCCESSFUL:
        raise ValueError("BACKUP_RETENTION_POLICY_DENIED")
    proven = [record for record in records if qualified(record)]
    ids = [r["runId"] for r in proven]
    if len(ids) != len(set(ids)):
        raise ValueError("BACKUP_RETENTION_DUPLICATE")
    if len(proven) <= keep:
        return []
    proven.sort(key=lambda row: (row["verifiedAtNs"], row["runId"]),
                reverse=True)
    protected = {r["runId"] for r in proven[:keep]}
    return [r for r in reversed(proven) if r["runId"] not in protected]

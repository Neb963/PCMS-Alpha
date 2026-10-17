"""Read-only S01 candidate native witness on PersonaMonkey's existing native port.

Not an independent routing daemon, wake service or proof of browser/route health.
An ACK proves that THIS process observed monotonic/boottime clocks on this pipe.
"""
import os
import re
import time
import uuid

_ID = re.compile(r"^[0-9a-f-]{36}$", re.I)


class RuntimeWitness:
    def __init__(self):
        self.observer_connection_id = str(uuid.uuid4())
        self.native_lifetime_id = str(uuid.uuid4())
        self.observer_epoch = str(uuid.uuid4())
        self.sequence = 0
        self.system_boot_id = self._read_boot_id()
        self._clock_awake = getattr(time, "CLOCK_MONOTONIC", None)
        self._clock_boot = getattr(time, "CLOCK_BOOTTIME", None)

    @staticmethod
    def _read_boot_id():
        try:
            with open("/proc/sys/kernel/random/boot_id", encoding="ascii") as stream:
                value = stream.read(64).strip()
            return value if _ID.fullmatch(value) else None
        except OSError:
            return None

    def sample(self):
        if self._clock_awake is None or self._clock_boot is None or not self.system_boot_id:
            return {"ok": False, "code": "WITNESS_UNAVAILABLE"}
        try:
            awake = time.clock_gettime_ns(self._clock_awake)
            boot = time.clock_gettime_ns(self._clock_boot)
        except (OSError, ValueError, AttributeError):
            return {"ok": False, "code": "WITNESS_UNAVAILABLE"}
        if awake < 0 or boot < awake:
            return {"ok": False, "code": "WITNESS_CLOCK_INCOMPATIBLE"}
        self.sequence += 1
        return {
            "ok": True,
            "schema": 1,
            "clockSemantics": "LINUX_MONOTONIC_EXCLUDES_SUSPEND_BOOTTIME_INCLUDES_SUSPEND",
            "observerConnectionId": self.observer_connection_id,
            "nativeLifetimeId": self.native_lifetime_id,
            "systemBootId": self.system_boot_id,
            "observerEpoch": self.observer_epoch,
            "sequence": self.sequence,
            "hostAwakeNs": str(awake),
            "hostBootNs": str(boot),
        }

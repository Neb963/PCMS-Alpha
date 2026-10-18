"""S02 unregistered fixed-purpose host tests with actual filesystem effects (D)."""
import base64
import hashlib
import os
import shutil
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backup_stream_v2 import BUFFER
from backup_v2_host import V2ArchiveHost
from test_backup_stream_v2 import make_payload

RUN = "s02_"+"b"*32
CUT = "b"*64
PASS = "host-recovery-disposable-secret"


class TestHost(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)/"backups"
        self.lookups=0
        def vault():
            self.lookups+=1
            return PASS
        self.host=V2ArchiveHost(self.root,vault)

    def tearDown(self):
        self.host.close()
        self.tmp.cleanup()

    def request(self,action,**kwargs):
        return self.host.action({"action":action,**kwargs})

    def begin(self,data):
        return self.request("export.begin",runId=RUN,cutDigest=CUT,
                            expectedPlaintextBytes=len(data),keyRef="portable-recovery")

    def append(self,bytes_,sequence):
        return self.request("export.append",runId=RUN,sequence=sequence,
                            bytes=base64.b64encode(bytes_).decode(),
                            sha256=hashlib.sha256(bytes_).hexdigest())


    def test_durable_entropy_pair_fence_after_success_and_host_restart(self):
        raw=make_payload()
        pair=(bytes(range(16)),bytes(range(12)))
        self.host._new_entropy=lambda:pair
        assert self.begin(raw)["ok"]
        for seq,pos in enumerate(range(0,len(raw),BUFFER)):
            assert self.append(raw[pos:pos+BUFFER],seq)["ok"]
        assert self.request("export.finish",runId=RUN,
                sequence=(len(raw)+BUFFER-1)//BUFFER,cutDigest=CUT)["ok"]
        header=(self.root/(RUN+".encrypted")).read_bytes()
        journal=(self.root/(RUN+".ledger")).read_bytes()
        marker=self.root/(".nonce-"+(pair[0]+pair[1]).hex())
        self.assertTrue(marker.exists())
        self.host.close()
        restarted=V2ArchiveHost(self.root,lambda:PASS)
        restarted._new_entropy=lambda:pair
        other="s02_"+"a"*32
        denied=restarted.action({"action":"export.begin","runId":other,
               "cutDigest":CUT,"expectedPlaintextBytes":len(raw),
               "keyRef":"portable-recovery"})
        self.assertEqual(denied["code"],"BACKUP_ENTROPY_PAIR_REUSED")
        self.assertFalse((self.root/(other+".encrypted")).exists())
        self.assertEqual((self.root/(RUN+".encrypted")).read_bytes(),header)
        self.assertEqual((self.root/(RUN+".ledger")).read_bytes(),journal)
        restarted.close()

    def test_abandoned_context_and_retained_reservation_deny_reuse(self):
        raw=make_payload()
        pair=(bytes(range(16)),bytes(range(12)))
        self.host._new_entropy=lambda:pair
        self.assertTrue(self.begin(raw)["ok"])
        self.assertTrue(self.append(raw[:min(BUFFER,len(raw))],0)["ok"])
        self.host.close()  # abandon without finalize or erasing possible effect
        preserved=(self.root/(RUN+".encrypted")).read_bytes()
        alternate="s02_"+"c"*32
        restarted=V2ArchiveHost(self.root,lambda:PASS)
        restarted._new_entropy=lambda:pair
        denied=restarted.action({"action":"export.begin","runId":alternate,
             "cutDigest":CUT,"expectedPlaintextBytes":len(raw),
             "keyRef":"portable-recovery"})
        self.assertEqual(denied["code"],"BACKUP_ENTROPY_PAIR_REUSED")
        self.assertEqual((self.root/(RUN+".encrypted")).read_bytes(),preserved)
        restarted.close()

    def test_durable_reservation_failure_keeps_uncertain_pair(self):
        raw=make_payload()
        pair=(bytes(range(16)),bytes(range(12)))
        self.host._new_entropy=lambda:pair
        original=self.host._reserve_entropy_pair
        def failed_after_reservation(run,nonce):
            original(run,nonce)
            raise OSError("injected durable reservation acknowledgment loss")
        self.host._reserve_entropy_pair=failed_after_reservation
        failed=self.begin(raw)
        self.assertFalse(failed["ok"])
        self.assertTrue((self.root/(RUN+".ledger")).exists())
        self.assertTrue((self.root/(".nonce-"+(pair[0]+pair[1]).hex())).exists())
        other="s02_"+"d"*32
        next_host=V2ArchiveHost(self.root,lambda:PASS)
        next_host._new_entropy=lambda:pair
        denied=next_host.action({"action":"export.begin","runId":other,
                    "cutDigest":CUT,"expectedPlaintextBytes":len(raw),
                    "keyRef":"portable-recovery"})
        self.assertEqual(denied["code"],"BACKUP_ENTROPY_PAIR_REUSED")
        self.assertFalse((self.root/(other+".encrypted")).exists())
        next_host.close()

    def test_corrupt_collision_evidence_fail_closed(self):
        raw=make_payload()
        self.root.mkdir(mode=0o700)
        broken=self.root/(".nonce-"+"f"*56)
        broken.write_bytes(b"malformed")
        broken.chmod(0o600)
        failed=self.begin(raw)
        self.assertEqual(failed["code"],"BACKUP_COLLISION_HISTORY_CORRUPT")
        self.assertFalse((self.root/(RUN+".encrypted")).exists())

    def test_legacy_header_collision_without_new_reservation(self):
        raw=make_payload()
        pair=(bytes(range(16)),bytes(range(12)))
        self.host._new_entropy=lambda:pair
        self.assertTrue(self.begin(raw)["ok"])
        self.host.close()
        # Simulate a pre-reservation legacy file with a valid header and
        # minimal ledger; the encrypted header must still fence its pair.
        original=(self.root/(RUN+".ledger"))
        import json
        contents=json.loads(original.read_text())
        del contents["entropyPair"]
        original.write_text(json.dumps(contents))
        original.chmod(0o600)
        (self.root/(".nonce-"+(pair[0]+pair[1]).hex())).unlink()
        other="s02_"+"e"*32
        host=V2ArchiveHost(self.root,lambda:PASS)
        host._new_entropy=lambda:pair
        denied=host.action({"action":"export.begin","runId":other,
                  "cutDigest":CUT,"expectedPlaintextBytes":len(raw),
                  "keyRef":"portable-recovery"})
        self.assertEqual(denied["code"],"BACKUP_ENTROPY_PAIR_REUSED")
        host.close()

    def test_missing_legacy_header_is_unresolvable_history_hold(self):
        raw=make_payload()
        self.root.mkdir(mode=0o700)
        import json
        (self.root/(RUN+".ledger")).write_text(json.dumps({
          "schema":1,"runId":RUN,"state":"CREATE_POSSIBLE"}))
        next_id="s02_"+"e"*32
        denied=self.request("export.begin",runId=next_id,cutDigest=CUT,
                    expectedPlaintextBytes=len(raw),keyRef="portable-recovery")
        self.assertEqual(denied["code"],"BACKUP_COLLISION_HISTORY_UNCERTAIN")
        self.assertFalse((self.root/(next_id+".encrypted")).exists())

    def test_complete_readback_and_no_automatic_promotion(self):
        raw=make_payload()
        self.assertEqual(self.begin(raw)["state"],"OPEN_OBSERVED")
        seq=0
        for start in range(0,len(raw),BUFFER):
            part=raw[start:start+BUFFER]
            accepted=self.append(part,seq)
            self.assertTrue(accepted["ok"],accepted)
            self.assertFalse(accepted["duplicate"])
            assert self.append(part,seq)["duplicate"]
            seq+=1
        bad=self.request("export.finish",runId=RUN,sequence=seq,cutDigest="f"*64)
        self.assertFalse(bad["ok"])
        self.assertEqual(self.request("export.finish",runId=RUN,sequence=seq,
                                     cutDigest=CUT)["state"],"WRITTEN_UNVERIFIED")
        status=self.request("archive.inspect",runId=RUN)
        self.assertEqual(status["state"],"WRITTEN_UNVERIFIED")
        checked=self.request("backup.verify",runId=RUN,keyRef="portable-recovery")
        self.assertTrue(checked["ok"],checked)
        self.assertEqual(checked["state"],"AUTHENTICATED_INVENTORY_ONLY")
        self.assertEqual(checked["uniqueBlobs"],1)
        self.assertEqual(self.lookups,2)
        data=self.request("archive.read",runId=RUN,offset=0,length=40)
        self.assertTrue(data["ok"])
        self.assertEqual(len(base64.b64decode(data["bytes"])),40)
        assert not self.begin(raw)["ok"]
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "WRITTEN_UNVERIFIED")

    def test_second_pass_stream_restore_requires_terminal_receipt(self):
        payload=make_payload()
        self.assertTrue(self.begin(payload)["ok"])
        for seq,start in enumerate(range(0,len(payload),BUFFER)):
            self.assertTrue(self.append(payload[start:start+BUFFER],seq)["ok"])
        count=(len(payload)+BUFFER-1)//BUFFER
        self.assertTrue(self.request("export.finish",runId=RUN,
                                     sequence=count,cutDigest=CUT)["ok"])
        self.assertFalse(self.request("restore.begin",runId=RUN,
                     keyRef="wrong")["ok"])
        started=self.request("restore.begin",runId=RUN,keyRef="portable-recovery")
        self.assertEqual(started["state"],"INACTIVE_STAGING_REQUIRED")
        self.assertFalse(self.request("restore.read",runId=RUN,
                                     sequence=2)["ok"])
        output=bytearray()
        seq=0
        while True:
            response=self.request("restore.read",runId=RUN,sequence=seq)
            self.assertTrue(response["ok"],response)
            output.extend(base64.b64decode(response["bytes"]))
            if response["complete"]:
                self.assertEqual(response["state"],"AUTHENTICATED_SECOND_PASS")
                self.assertEqual(response["sha256"],started["sha256"])
                break
            seq+=1
        self.assertEqual(output,payload)
        self.assertEqual(self.request("restore.read",runId=RUN,
                                     sequence=seq)["ok"],False)

    def test_reader_abort_never_confers_terminal_authority(self):
        payload=make_payload()
        self.assertTrue(self.begin(payload)["ok"])
        for seq,start in enumerate(range(0,len(payload),BUFFER)):
            self.append(payload[start:start+BUFFER],seq)
        count=(len(payload)+BUFFER-1)//BUFFER
        self.request("export.finish",runId=RUN,sequence=count,cutDigest=CUT)
        start=self.request("restore.begin",runId=RUN,keyRef="portable-recovery")
        self.assertTrue(start["ok"],start)
        first=self.request("restore.read",runId=RUN,sequence=0)
        self.assertTrue(first["ok"],first)
        self.assertFalse(first["complete"])
        self.assertEqual(self.request("restore.abort",runId=RUN)["state"],
                         "RESTORE_READER_ABORTED")
        self.assertFalse(self.request("restore.read",runId=RUN,
                                      sequence=1)["ok"])
        # Read-only reinspection is possible, but no automatic staged commit.
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "WRITTEN_UNVERIFIED")

    def test_native_recovery_qualification_and_fourteen_successful_file_retention(self):
        raw=make_payload()
        self.assertTrue(self.begin(raw)["ok"])
        for seq,start in enumerate(range(0,len(raw),BUFFER)):
            self.assertTrue(self.append(raw[start:start+BUFFER],seq)["ok"])
        count=(len(raw)+BUFFER-1)//BUFFER
        self.assertTrue(self.request("export.finish",runId=RUN,
                                     sequence=count,cutDigest=CUT)["ok"])
        denied=self.request("archive.recovery.complete",runId=RUN,
                            sha256="a"*64,preparedSha256="b"*64,
                            status="INACTIVE_PREPARED_NOT_APPLIED")
        self.assertEqual(denied["code"],"BACKUP_RECOVERY_RECEIPT_REQUIRED")
        receipt=self.request("restore.begin",runId=RUN,keyRef="portable-recovery")
        self.assertTrue(receipt["ok"],receipt)
        seq=0
        while True:
            piece=self.request("restore.read",runId=RUN,sequence=seq)
            self.assertTrue(piece["ok"],piece)
            if piece["complete"]:
                self.assertEqual(piece["sha256"],receipt["sha256"])
                break
            seq+=1
        self.assertEqual(self.request("archive.recovery.complete",
            runId=RUN,sha256="a"*64,preparedSha256="b"*64,
            status="INACTIVE_PREPARED_NOT_APPLIED")["code"],
            "BACKUP_RECOVERY_RECEIPT_REQUIRED")
        qualified=self.request("archive.recovery.complete",runId=RUN,
            sha256=receipt["sha256"],preparedSha256="b"*64,
            status="INACTIVE_PREPARED_NOT_APPLIED")
        self.assertTrue(qualified["ok"],qualified)
        self.assertEqual(qualified["state"],"RECOVERY_VERIFIED")
        done=self.request("archive.inspect",runId=RUN)
        self.assertEqual(done["state"],"RECOVERY_VERIFIED")
        self.assertEqual(done["ciphertextSha256"],receipt["sha256"])
        self.assertEqual(done["preparedSha256"],"b"*64)
        reopened=self.request("backup.verify",runId=RUN,
                              keyRef="portable-recovery")
        self.assertEqual(reopened["sha256"],receipt["sha256"])
        self.assertEqual(reopened["state"],"AUTHENTICATED_INVENTORY_ONLY")
        self.assertEqual(self.request("archive.retention.plan")["qualified"],1)
        self.assertEqual(self.request("archive.retention.prune")["state"],
                         "NO_ELIGIBLE_DELETE")
        encrypted=self.root/(RUN+".encrypted")
        # A deterministic disposable 16-copy file fleet, every file present,
        # is acceptable *only* as a synthetic retention oracle. All original
        # qualification still used real native verification and source frames.
        for n in range(16):
            target="s02_"+format(n+1,"032x")
            shutil.copyfile(encrypted,self.root/(target+".encrypted"))
            self.host._write({"schema":1,"runId":target,
                "state":"RECOVERY_VERIFIED","ciphertextSha256":receipt["sha256"],
                "preparedSha256":"c"*64,"verifiedAtNs":n+1,
                "cutDigest":CUT,"nextSequence":0,"last":None,
                "plaintextBytes":len(raw),"acceptedBytes":len(raw)})
        plan=self.request("archive.retention.plan")
        self.assertTrue(plan["ok"],plan)
        self.assertEqual(plan["qualified"],17)
        self.assertEqual(plan["pruneCandidate"],"s02_"+format(1,"032x"))
        old=[self.request("archive.retention.prune") for _ in range(3)]
        self.assertTrue(all(x.get("state")=="REMOVED" for x in old),old)
        self.assertTrue(all(not (self.root/("s02_"+format(n,"032x")+
                        ".encrypted")).exists() for n in range(1,4)))
        self.assertEqual(self.request("archive.retention.plan")["qualified"],14)
        self.assertEqual(self.request("archive.retention.prune")["state"],
                         "NO_ELIGIBLE_DELETE")
        self.assertTrue(encrypted.exists(),"last known-good protected")
        # Simulate a deletion that reached disk but whose ACK was lost.
        extra="s02_"+format(90,"032x")
        shutil.copyfile(encrypted,self.root/(extra+".encrypted"))
        self.host._write({"schema":1,"runId":extra,
            "state":"RECOVERY_VERIFIED","ciphertextSha256":receipt["sha256"],
            "preparedSha256":"c"*64,"verifiedAtNs":1,
            "cutDigest":CUT,"nextSequence":0,"last":None,
            "plaintextBytes":len(raw),"acceptedBytes":len(raw)})
        def deleted_but_ack_lost(path):
            os.unlink(path)
            raise OSError("lost unlink ACK")
        with patch.object(self.host,"_unlink_artifact",
                          side_effect=deleted_but_ack_lost):
            unsure=self.request("archive.retention.prune")
        self.assertEqual(unsure["code"],"BACKUP_NATIVE_UNAVAILABLE")
        self.assertEqual(self.request("archive.inspect",runId=extra)["state"],
                         "DELETE_POSSIBLE")
        self.assertEqual(self.request("archive.retention.prune")["code"],
                         "BACKUP_RETENTION_UNCERTAIN_DELETE")
        self.assertTrue(encrypted.exists())
        # A missing protected success must never authorize further deletion.
        self.root.joinpath("s02_"+format(4,"032x")+".encrypted").unlink()
        self.assertEqual(self.request("archive.retention.prune")["code"],
                         "BACKUP_RETENTION_INTEGRITY_HOLD")
        self.assertTrue(encrypted.exists())

    def test_r4_pinned_root_rename_or_replacement_blocks_all_new_effects(self):
        fd=self.host._pin_root(create=True)
        self.assertGreater(fd,0)
        moved=Path(self.tmp.name)/"moved-backups"
        self.root.rename(moved)
        self.root.mkdir(mode=0o700)
        (self.root/"foreign.bin").write_bytes(b"DO NOT DELETE")
        failed=self.begin(b"ABC")
        self.assertEqual(failed["code"],"BACKUP_ROOT_CHANGED")
        self.assertEqual((self.root/"foreign.bin").read_bytes(),b"DO NOT DELETE")
        self.assertFalse((self.root/(RUN+".encrypted")).exists())
        self.assertFalse((moved/(RUN+".encrypted")).exists())

    def test_r4_verify_to_delete_symlink_substitution_never_follows_target(self):
        self.host._pin_root(create=True)
        target=Path(self.tmp.name)/"protected-test-data"
        target.write_bytes(b"ORIGINAL-USER-DATA")
        path=self.root/(RUN+".encrypted")
        path.write_bytes(b"original-qualified-artifact")
        before=path.stat()
        self.host._delete_identity=(before.st_dev,before.st_ino,
            before.st_size,before.st_mtime_ns,before.st_ctime_ns)
        path.unlink()
        path.symlink_to(target)
        with self.assertRaisesRegex(Exception,"BACKUP_RETENTION_FILE_CHANGED"):
            self.host._unlink_artifact(path)
        self.assertEqual(target.read_bytes(),b"ORIGINAL-USER-DATA")
        self.assertTrue(path.is_symlink())

    def test_r4_hardlink_and_failed_journal_fsync_hold_without_delete(self):
        self.host._pin_root(create=True)
        path=self.root/(RUN+".encrypted")
        path.write_bytes(b"original-qualified-artifact")
        other=self.root/"linked-test"
        os.link(path,other)
        before=path.stat()
        self.host._delete_identity=(before.st_dev,before.st_ino,
            before.st_size,before.st_mtime_ns,before.st_ctime_ns)
        with self.assertRaisesRegex(Exception,"BACKUP_RETENTION_FILE_CHANGED"):
            self.host._unlink_artifact(path)
        self.assertTrue(path.exists())
        self.assertEqual(other.read_bytes(),b"original-qualified-artifact")
        # No mutation if ledger's durable rename/fsync has an uncertain ACK.
        import backup_v2_host as module
        real=os.fsync
        def fail_directory(fd):
            if fd==self.host._root_descriptor:raise OSError("lost directory fsync")
            return real(fd)
        with patch.object(module.os,"fsync",side_effect=fail_directory):
            failed=self.request("export.begin",runId="s02_"+"c"*32,
                cutDigest=CUT,expectedPlaintextBytes=3,keyRef="portable-recovery")
        self.assertEqual(failed["code"],"BACKUP_NATIVE_UNAVAILABLE")
        self.assertIsNone(self.host._export_lock)
        self.assertTrue((self.root/("s02_"+"c"*32+".ledger")).exists())
        self.assertFalse((self.root/("s02_"+"c"*32+".encrypted")).exists())

    def test_readonly_inspection_does_not_create_root_or_lookup_vault(self):
        out=self.request("archive.inspect",runId=RUN)
        self.assertEqual(out["code"],"BACKUP_NOT_TRACKED")
        self.assertFalse(self.root.exists())
        self.assertEqual(self.lookups,0)
        self.assertEqual(self.request("archive.inspect",runId="../escape")["ok"],False)
        self.assertFalse(self.root.exists())

    def test_close_before_finish_preserves_uncertain_run_and_denies_replay(self):
        self.assertTrue(self.begin(b"ABCD")["ok"])
        self.assertTrue(self.append(b"AB",0)["ok"])
        self.host.close()
        resumed=V2ArchiveHost(self.root,lambda:PASS)
        self.assertEqual(resumed.action({"action":"archive.inspect","runId":RUN})["state"],
                         "OPEN_OBSERVED")
        self.assertEqual(resumed.action({"action":"export.begin","runId":RUN,
                          "cutDigest":CUT,"expectedPlaintextBytes":4,
                          "keyRef":"portable-recovery"})["code"],"BACKUP_RUN_ALREADY_USED")
        self.assertEqual(resumed.action({"action":"export.append","runId":RUN,
                          "sequence":1,"bytes":"Q0Q=",
                          "sha256":hashlib.sha256(b"CD").hexdigest()})["code"],
                         "BACKUP_SESSION_NOT_OWNED")

    def test_lost_ack_after_possible_append_never_reenqueues(self):
        self.assertTrue(self.begin(b"ABCD")["ok"])
        orig=self.host._write
        def fail_after_possible(record):
            if record["state"]=="OPEN_OBSERVED" and record["nextSequence"]==1:
                raise OSError("disk ACK missing")
            return orig(record)
        self.host._write=fail_after_possible
        failed=self.append(b"AB",0)
        self.assertEqual(failed["code"],"BACKUP_NATIVE_UNAVAILABLE")
        self.host.close()
        new=V2ArchiveHost(self.root,lambda:PASS)
        self.assertEqual(new.action({"action":"archive.inspect","runId":RUN})["state"],
                         "APPEND_POSSIBLE")
        self.assertFalse(new.action({"action":"export.append","runId":RUN,"sequence":0,
                          "bytes":"QUI=",
                          "sha256":hashlib.sha256(b"AB").hexdigest()})["ok"])

    def test_intermediate_symlink_is_rejected_before_creating_child(self):
        source=Path(self.tmp.name)/"actual-parent"
        source.mkdir()
        alias=Path(self.tmp.name)/"alias"
        os.symlink(source,alias)
        self.host=V2ArchiveHost(alias/"backup-root",lambda:PASS)
        result=self.begin(b"source")
        self.assertEqual(result["code"],"BACKUP_ROOT_UNSAFE")
        self.assertFalse((source/"backup-root").exists(),
                         "no side effects may occur via an ancestor symlink")

    def test_f1_duplicate_begin_releases_lock_same_native_connection(self):
        self.assertTrue(self.begin(b"ABCD")["ok"])
        self.host.close()
        self.host=V2ArchiveHost(self.root,lambda:PASS)
        self.assertEqual(self.begin(b"ABCD")["code"],"BACKUP_RUN_ALREADY_USED")
        self.assertIsNone(self.host._export_lock)
        different="s02_"+"a"*32
        answer=self.request("export.begin",runId=different,cutDigest=CUT,
                            expectedPlaintextBytes=5,keyRef="portable-recovery")
        self.assertTrue(answer["ok"],answer)
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "OPEN_OBSERVED")
        self.assertEqual(self.request("archive.inspect",runId=different)["state"],
                         "OPEN_OBSERVED")

    def test_f1_vault_unavailable_releases_lock_without_creating_ledger(self):
        values=iter([None,PASS])
        self.host.vault_get=lambda:next(values)
        self.assertEqual(self.begin(b"ABC")["code"],"BACKUP_VAULT_UNAVAILABLE")
        self.assertIsNone(self.host._export_lock)
        self.assertFalse((self.root/(RUN+".ledger")).exists())
        alternate="s02_"+"a"*32
        answer=self.request("export.begin",runId=alternate,cutDigest=CUT,
                            expectedPlaintextBytes=3,keyRef="portable-recovery")
        self.assertTrue(answer["ok"],answer)
        self.assertFalse((self.root/(RUN+".encrypted")).exists())

    def test_f1_header_write_after_create_preserves_partial_cipher_and_releases_fd(self):
        def half_header(fd,raw):
            os.write(fd,raw[:4])
            raise OSError("disk full after exclusive open")
        # Root dirfd is a durable per-host capability. Pin it before
        # measuring leaks; failed begin must not strand cipher/lock descriptors.
        self.host._pin_root(create=True)
        before=len(os.listdir("/proc/self/fd")) if os.path.isdir("/proc/self/fd") else None
        with patch("backup_stream_v2._write_all",side_effect=half_header):
            result=self.begin(b"ABC")
        self.assertEqual(result["code"],"BACKUP_NATIVE_UNAVAILABLE")
        self.assertIsNone(self.host._export_lock)
        self.assertIsNone(self.host.current)
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "CREATE_POSSIBLE")
        self.assertEqual((self.root/(RUN+".encrypted")).read_bytes(),b"PCMS")
        if before is not None:
            self.assertEqual(len(os.listdir("/proc/self/fd")),before)
        other="s02_"+"e"*32
        self.assertTrue(self.request("export.begin",runId=other,cutDigest=CUT,
                        expectedPlaintextBytes=3,keyRef="portable-recovery")["ok"])
        self.assertEqual((self.root/(RUN+".encrypted")).read_bytes(),b"PCMS")

    def test_f1_after_writer_creation_open_ack_disk_failure_still_unlocks(self):
        original=self.host._write
        def lose_open_receipt(record):
            if record["state"]=="OPEN_OBSERVED":
                raise OSError("open ACK durability failed")
            return original(record)
        self.host._write=lose_open_receipt
        denied=self.begin(b"ABC")
        self.assertEqual(denied["code"],"BACKUP_NATIVE_UNAVAILABLE")
        self.assertIsNone(self.host._export_lock)
        self.assertIsNone(self.host.current)
        self.assertIsNone(self.host.writer)
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "CREATE_POSSIBLE")
        # Header bytes may exist. Never unlink or retry the same run.
        self.assertTrue((self.root/(RUN+".encrypted")).exists())
        self.host._write=original
        different="s02_"+"d"*32
        next_run=self.request("export.begin",runId=different,cutDigest=CUT,
                              expectedPlaintextBytes=3,keyRef="portable-recovery")
        self.assertTrue(next_run["ok"],next_run)
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "CREATE_POSSIBLE")

    def test_f1_file_open_error_keeps_possible_journal_but_releases_lock(self):
        # Actual writer creation/open failure after durable CREATE_POSSIBLE.
        original=self.host
        with patch("backup_v2_host.EncryptedWriter",
                   side_effect=OSError("injected disk open failure")):
            result=self.begin(b"ABC")
        self.assertEqual(result["code"],"BACKUP_NATIVE_UNAVAILABLE")
        self.assertIsNone(original._export_lock)
        self.assertIsNone(original.current)
        self.assertIsNone(original.writer)
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "CREATE_POSSIBLE")
        self.assertFalse((self.root/(RUN+".encrypted")).exists())
        distinct="s02_"+"a"*32
        answer=self.request("export.begin",runId=distinct,cutDigest=CUT,
                            expectedPlaintextBytes=3,keyRef="portable-recovery")
        self.assertTrue(answer["ok"],answer)
        self.assertEqual(self.request("archive.inspect",runId=RUN)["state"],
                         "CREATE_POSSIBLE")
        self.assertFalse(self.request("export.append",runId=RUN,sequence=0,
            bytes="QQ==",sha256=hashlib.sha256(b"A").hexdigest())["ok"])

    def test_concurrent_native_process_contexts_have_exactly_one_writer(self):
        payload=make_payload()
        first=self.begin(payload)
        self.assertTrue(first["ok"],first)
        other=V2ArchiveHost(self.root,lambda:PASS)
        alternative="s02_"+"d"*32
        denied=other.action({"action":"export.begin","runId":alternative,
            "cutDigest":CUT,"expectedPlaintextBytes":3,
            "keyRef":"portable-recovery"})
        self.assertEqual(denied["code"],"BACKUP_SESSION_BUSY")
        self.assertFalse((self.root/(alternative+".ledger")).exists())
        self.assertFalse((self.root/(alternative+".encrypted")).exists())
        self.host.close()
        # Releasing the OS lock cannot authorize resuming the uncertain
        # original run, but a distinct new operator intent may start.
        accepted=other.action({"action":"export.begin","runId":alternative,
            "cutDigest":CUT,"expectedPlaintextBytes":3,
            "keyRef":"portable-recovery"})
        self.assertTrue(accepted["ok"],accepted)
        other.close()
        observed=V2ArchiveHost(self.root,lambda:PASS)
        self.assertEqual(observed.action({"action":"archive.inspect",
            "runId":RUN})["state"],"OPEN_OBSERVED")
        self.assertEqual(observed.action({"action":"archive.inspect",
            "runId":alternative})["state"],"OPEN_OBSERVED")

    def test_symlink_root_and_injected_command_fail_closed(self):
        other=Path(self.tmp.name)/"real"
        other.mkdir()
        os.symlink(other,self.root)
        self.assertEqual(self.begin(b"yes")["code"],"BACKUP_ROOT_UNSAFE")
        self.assertFalse((other/(RUN+".encrypted")).exists())
        for forged in (
            {"action":"archive.inspect","runId":RUN,"path":"/etc/passwd"},
            {"action":"backup.verify","runId":RUN,"keyRef":"other"},
            {"action":"shell","command":"true"},
        ):
            self.assertFalse(self.host.action(forged)["ok"])


if __name__=="__main__":
    unittest.main()

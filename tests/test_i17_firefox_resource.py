import pathlib
import tempfile
import unittest
from scripts.i17_firefox_resource import sample_firefox_processes

class FirefoxResourceProbe(unittest.TestCase):
    def test_procfs_executable_isolation_and_cpu_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            binary=root/'firefox'/'firefox-bin'
            binary.parent.mkdir()
            binary.write_bytes(b'fixture')
            other=root/'other'/'firefox-bin'
            other.parent.mkdir()
            other.write_bytes(b'unrelated')
            proc=root/'proc'
            proc.mkdir()
            for pid,exe in [(123,binary),(124,other)]:
                p=proc/str(pid)
                p.mkdir()
                (p/'exe').symlink_to(exe)
                (p/'status').write_text('VmRSS:\t5000 kB\nThreads:\t6\n')
                fields=['S']+['0']*10+['120','33']+['0']*10
                (p/'stat').write_text(f'{pid} (firefox-bin) '+' '.join(fields))
            measured=sample_firefox_processes(binary,proc)
            self.assertEqual(measured['processes'],1)
            self.assertEqual(measured['rssSumKiB'],5000)
            self.assertEqual(measured['threads'],6)
            self.assertEqual(measured['cpuTicks'],153)
            self.assertNotIn(str(root),str(measured))
    def test_unavailable_or_unreadable_never_infers_zero_healthy_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            self.assertEqual(sample_firefox_processes(root/'firefox','/nonexistent-i17-proc'),
                             {'available':False,'reason':'PROCFS_UNAVAILABLE'})
            (root/'empty').mkdir()
            self.assertEqual(sample_firefox_processes(root/'firefox',root/'empty'),
                             {'available':False,'reason':'FIREFOX_PROCESS_NOT_OBSERVED'})

if __name__=='__main__':
    unittest.main()

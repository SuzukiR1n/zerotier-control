import importlib.util
from pathlib import Path
import os
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("bootstrap", Path(__file__).resolve().parents[1] / "planet/bootstrap.py")
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class EndpointValidation(unittest.TestCase):
    def test_valid_ipv4_ipv6_and_deduplication(self):
        self.assertEqual(bootstrap.endpoints("203.0.113.1/9993,2001:db8::1/9993,203.0.113.1/9993"), ["203.0.113.1/9993", "2001:db8::1/9993"])

    def test_rejects_bad_configuration_before_identity_generation(self):
        for value in ("", "YOUR_PUBLIC_IP/9993", "domain.example/9993", "127.0.0.1/0", "203.0.113.1/99999", "203.0.113.1/9993/", "0.0.0.0/9993", "ff02::1/9993", "fe80::1%eth0/9993"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                bootstrap.endpoints(value)


class ManagementToken(unittest.TestCase):
    def test_new_token_has_no_header_whitespace(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "authtoken.secret"
            token = bootstrap.management_token(path)
            self.assertRegex(token.decode("ascii"), r"^[0-9a-f]{64}$")
            self.assertEqual(path.read_bytes(), token)
            if os.name != "nt":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_legacy_whitespace_preserves_existing_token(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "authtoken.secret"
            path.write_bytes(b"  test-existing-controller-token\r\n")
            token = bootstrap.management_token(path)
            self.assertEqual(token, b"test-existing-controller-token")
            self.assertEqual(path.read_bytes(), token)

    def test_invalid_token_is_not_silently_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "authtoken.secret"
            for token in (b"\n", b"invalid\ntoken", b"invalid\x00token"):
                path.write_bytes(token)
                with self.assertRaises(ValueError):
                    bootstrap.management_token(path)
                self.assertEqual(path.read_bytes(), token)


if __name__ == "__main__":
    unittest.main()

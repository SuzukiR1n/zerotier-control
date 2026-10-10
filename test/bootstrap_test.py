import importlib.util
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()

import unittest
import sys
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parent))

from main import build_presence_timeline
from security import AuthContext, StudentPayload, owns_resource


class SecurityTests(unittest.TestCase):
    def test_presence_timeline_flags_early_departure_and_return(self):
        timeline = build_presence_timeline([(0, 120), (180, 240)], 900)

        self.assertEqual(timeline["check_in_at"], "00:00:00")
        self.assertEqual(timeline["check_out_at"], "00:04:00")
        self.assertTrue(timeline["left_early"])
        self.assertTrue(timeline["returned_after_leave"])

    def test_student_payload_rejects_extra_fields(self):
        with self.assertRaises(ValidationError):
            StudentPayload(
                student_id="STU-1",
                student_name="Ada Lovelace",
                owner_id="attacker",
            )

    def test_resource_ownership_enforced(self):
        user = AuthContext(user_id="user_1", role="teacher")
        other = AuthContext(user_id="user_2", role="teacher")
        admin = AuthContext(user_id="admin_1", role="admin")
        resource = {"owner_id": "user_1"}

        self.assertTrue(owns_resource(resource, user))
        self.assertFalse(owns_resource(resource, other))
        self.assertTrue(owns_resource(resource, admin))


if __name__ == "__main__":
    unittest.main()

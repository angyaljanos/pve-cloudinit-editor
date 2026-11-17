import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from deploy import (
    API_TARGET,
    BACKUP_DIR,
    NODES_API,
    UI_TARGET,
    UI_TEMPLATE,
    DeployError,
    deploy,
    patch_nodes_api,
    patch_ui_template,
)

NODES_API_FIXTURE = """use PVE::API2::NodeConfig;
use base qw(PVE::RESTHandler);

__PACKAGE__->register_method({
    subclass => "PVE::API2::Qemu",
    path => 'qemu',
});
"""

UI_TEMPLATE_FIXTURE = """    <script type="text/javascript">
    if (typeof(PVE) === 'undefined') PVE = {};
"""


class PatchTests(unittest.TestCase):
    def test_api_patch_is_idempotent(self):
        patched = patch_nodes_api(NODES_API_FIXTURE)
        self.assertIn("PVE::API2::Nodes::Nodeinfo::CloudInitEditor", patched)
        self.assertEqual(patch_nodes_api(patched), patched)

    def test_api_patch_rejects_partial_patch(self):
        partial = "# pve-cloudinit-editor API import\nuse PVE::API2::Nodes::Nodeinfo::CloudInitEditor;\n"
        with self.assertRaises(DeployError):
            patch_nodes_api(partial + NODES_API_FIXTURE)

    def test_ui_patch_replaces_previous_bundle_hash(self):
        updated = patch_ui_template(patch_ui_template(UI_TEMPLATE_FIXTURE, "a" * 12), "b" * 12)
        self.assertNotIn("a" * 12, updated)
        self.assertEqual(updated.count("pve-cloudinit-editor.js?v=" + "b" * 12), 1)


class DeployTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for relative, text in ((NODES_API, NODES_API_FIXTURE), (UI_TEMPLATE, UI_TEMPLATE_FIXTURE)):
            path = self.root / relative
            path.parent.mkdir(parents=True)
            path.write_text(text, encoding="utf-8")

    def test_install_then_update_is_repeatable(self):
        deploy(self.root)
        deploy(self.root)

        self.assertTrue((self.root / API_TARGET).is_file())
        self.assertTrue((self.root / UI_TARGET).is_file())
        api = (self.root / NODES_API).read_text(encoding="utf-8")
        self.assertEqual(api.count("path => 'cloudinit-editor'"), 1)
        backup = self.root / BACKUP_DIR / NODES_API
        self.assertEqual(backup.read_text(encoding="utf-8"), NODES_API_FIXTURE)

    def test_failed_verification_restores_every_file(self):
        def fail(_root):
            raise DeployError("verification failed")

        with self.assertRaises(DeployError):
            deploy(self.root, verify=fail)

        self.assertEqual(
            (self.root / NODES_API).read_text(encoding="utf-8"), NODES_API_FIXTURE
        )
        self.assertEqual(
            (self.root / UI_TEMPLATE).read_text(encoding="utf-8"), UI_TEMPLATE_FIXTURE
        )
        self.assertFalse((self.root / API_TARGET).exists())
        self.assertFalse((self.root / UI_TARGET).exists())


if __name__ == "__main__":
    unittest.main()
